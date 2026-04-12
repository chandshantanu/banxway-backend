/**
 * Agent Result Worker
 *
 * BullMQ worker for the 'agent-tasks' queue.
 * Processes results that come back from AgentBuilder webhook callbacks
 * and publishes the processed output to the next Kafka topic in the pipeline.
 *
 * Pipeline flow:
 *   AgentBuilder webhook → agent-webhooks router → BullMQ 'agent-tasks' queue
 *   → this worker → next Kafka topic → next AgentBuilder agent
 *
 * @created 2026-02-26
 */

import { Worker, Job, Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { getRedisConnection } from '../config/redis.config';
import { supabaseAdmin } from '../config/database.config';
import { publishToKafka, KAFKA_TOPICS } from '../config/kafka.config';
import crmCustomerRepository from '../database/repositories/crm-customer.repository';
import notificationRepository from '../database/repositories/notification.repository';
import { io } from '../index';

/**
 * Notify all active users and push via WebSocket.
 * Non-fatal — notification failures must never block the pipeline.
 */
async function notifyTeam(
  type: 'TASK_ASSIGNED' | 'HIGH_PRIORITY' | 'HANDOFF_REQUEST',
  title: string,
  message: string,
  opts: { threadId?: string; actionUrl?: string } = {}
): Promise<void> {
  try {
    // Find all active users to notify
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('is_active', true);

    if (!users?.length) return;

    for (const user of users) {
      await notificationRepository.create({
        user_id: user.id,
        type,
        title,
        message,
        thread_id: opts.threadId,
        action_url: opts.actionUrl,
      }).catch(() => {}); // swallow per-user errors
    }

    // Real-time push via WebSocket
    io?.emit('notification:new', { type, title, message, ...opts });
  } catch (err: any) {
    logger.warn('Failed to send team notification (non-fatal)', { error: err.message });
  }
}

export type AgentResultType =
  | 'ingestion_complete'
  | 'processing_complete'
  | 'correlation_complete'
  | 'extraction_complete'
  | 'business_result'
  | 'validation_required'
  | 'validation_complete';

export interface AgentResultJobData {
  resultType: AgentResultType;
  agentId: string;
  executionId?: string;
  /** The key entity this result is for — could be threadId, documentId, shipmentRequestId */
  entityId: string;
  /** The full payload from the agent */
  payload: Record<string, any>;
}

/**
 * Handle ingestion complete — update thread, forward to processing pipeline via Kafka
 */
async function handleIngestionComplete(data: AgentResultJobData): Promise<void> {
  const { entityId: threadId, payload } = data;
  const { channel, rawContent, metadata } = payload;

  // Upsert thread pipeline status.
  // agent_status column added in 011_fix_agent_message_columns.sql.
  await supabaseAdmin
    .from('communication_threads')
    .update({
      agent_status: 'processing',
      workflow_state: { lastAgentId: data.agentId, ...metadata },
    })
    .eq('id', threadId);

  // Publish to 'messages.processed' Kafka topic — consumed by L2 processing agents
  await publishToKafka(KAFKA_TOPICS.PROCESSED, {
    threadId,
    channel,
    rawContent,
    agentId: data.agentId,
    timestamp: new Date().toISOString(),
    ...metadata,
  }, threadId);

  logger.info('Ingestion result handled', { threadId, channel });
}

/**
 * Handle processing complete — update thread with extracted data, trigger L3 if docs found
 */
async function handleProcessingComplete(data: AgentResultJobData): Promise<void> {
  const { entityId: messageId, payload } = data;
  const { intent, entities, confidence, hasDocuments, documentUrls } = payload;

  // Update the communication message with parsed intent + entities.
  // Column names match 001_initial_schema.sql: intent, extracted_data, confidence_score.
  // ai_processing_status added in 011_fix_agent_message_columns.sql.
  await supabaseAdmin
    .from('communication_messages')
    .update({
      intent,
      extracted_data: entities,
      confidence_score: confidence,
      ai_processing_status: 'processed',
    })
    .eq('id', messageId);

  // If documents were detected, queue each for extraction
  if (hasDocuments && Array.isArray(documentUrls) && documentUrls.length > 0) {
    for (const doc of documentUrls) {
      await publishToKafka(KAFKA_TOPICS.DOCUMENTS_EXTRACTED, {
        messageId,
        documentUrl: doc.url,
        documentType: doc.type || 'pdf',
        fileName: doc.name,
        triggeredBy: 'processing_agent',
      }, doc.url);
    }
    logger.info('Processing result triggered document extraction', {
      messageId,
      documentCount: documentUrls.length,
    });
  }

  // Forward to business layer via Kafka if it's an actionable intent
  const actionableIntents = ['quote_request', 'booking', 'shipment_update'];
  if (actionableIntents.includes(intent)) {
    // Look up the thread for this message so we can pass threadId downstream
    const { data: msg } = await supabaseAdmin
      .from('communication_messages')
      .select('thread_id, from_address, subject')
      .eq('id', messageId)
      .single();

    await publishToKafka(KAFKA_TOPICS.BUSINESS, {
      messageId,
      threadId: msg?.thread_id,
      intent,
      entities,
      confidence,
    }, messageId);

    // Notify team about actionable email
    const intentLabel = intent === 'quote_request' ? 'Quote Request'
      : intent === 'booking' ? 'Booking Request'
      : 'Shipment Update';

    await notifyTeam(
      'TASK_ASSIGNED',
      `${intentLabel} detected`,
      `Email from ${msg?.from_address || 'unknown'}: "${msg?.subject || 'no subject'}" classified as ${intentLabel} (${Math.round((confidence || 0) * 100)}% confidence).`,
      { threadId: msg?.thread_id, actionUrl: `/inbox?thread=${msg?.thread_id}` }
    );
  }

  logger.info('Processing result handled', { messageId, intent, confidence });
}

/**
 * Handle correlation complete — the core intelligence step.
 *
 * Given a thread and the sender's email address, this handler:
 *   1. Looks up the sender in crm_customers (primary_email match)
 *   2. If found → links thread to existing customer, classifies as 'existing_customer'
 *      and checks for active shipments to refine to 'existing_shipment'
 *   3. If not found → auto-creates a new CRM customer with status='LEAD',
 *      links thread, classifies as 'new_lead'
 *
 * This can be triggered by:
 *   a) The correlationEngine AgentBuilder agent calling /agent-webhooks/correlation-complete
 *   b) Directly from the email-poller worker after a message is saved (backend-native path)
 */
async function handleCorrelationComplete(data: AgentResultJobData): Promise<void> {
  const { entityId: threadId, payload } = data;
  const {
    fromEmail,
    fromName,
    matchedCustomerId,   // provided by agent (optional — we re-verify)
    matchedShipmentId,   // provided by agent (optional)
    classification: agentClassification,
  } = payload;

  if (!threadId || !fromEmail) {
    logger.warn('Correlation skipped — missing threadId or fromEmail', { threadId, fromEmail });
    return;
  }

  try {
    let crmCustomer = matchedCustomerId
      ? await crmCustomerRepository.findById(matchedCustomerId)
      : await crmCustomerRepository.findByEmail(fromEmail);

    let classification: string;
    let shipmentId: string | null = matchedShipmentId || null;

    if (crmCustomer) {
      // Customer already exists — check for active shipments on this thread or customer
      if (!shipmentId) {
        const { data: openShipments } = await supabaseAdmin
          .from('shipments')
          .select('id')
          .eq('customer_id', crmCustomer.id)
          .in('status', ['BOOKED', 'IN_TRANSIT', 'AT_PORT', 'CUSTOMS_CLEARANCE'])
          .order('created_at', { ascending: false })
          .limit(1);
        shipmentId = openShipments?.[0]?.id ?? null;
      }

      classification = shipmentId ? 'existing_shipment' : 'existing_customer';

      logger.info('Correlation: matched existing customer', {
        threadId, crmCustomerId: crmCustomer.id, classification, shipmentId,
      });
    } else {
      // New sender — auto-create as a LEAD in CRM
      const displayName = fromName || fromEmail.split('@')[0];
      crmCustomer = await crmCustomerRepository.create({
        legal_name: displayName,
        trading_name: displayName,
        primary_email: fromEmail,
        status: 'LEAD',
        customer_tier: 'NEW',
        lead_source: 'email_inbound',
        lead_notes: `Auto-created from inbound email: ${fromEmail}`,
      });

      classification = 'new_lead';

      logger.info('Correlation: created new lead from inbound email', {
        threadId, crmCustomerId: crmCustomer.id, fromEmail,
      });

      // Notify the team about the new lead
      await notifyTeam(
        'HIGH_PRIORITY',
        `New Lead: ${displayName}`,
        `Inbound email from ${fromEmail} — auto-created as CRM lead.`,
        { threadId, actionUrl: `/inbox?thread=${threadId}` }
      );
    }

    // Link the thread to the CRM customer and record the classification
    await supabaseAdmin
      .from('communication_threads')
      .update({
        crm_customer_id: crmCustomer.id,
        lead_classification: classification,
        correlation_status: 'matched',
        correlated_at: new Date().toISOString(),
        // Also populate shipment_id if we found an active shipment
        ...(shipmentId ? { shipment_id: shipmentId } : {}),
      })
      .eq('id', threadId);

    logger.info('Correlation complete', { threadId, classification, crmCustomerId: crmCustomer.id });
  } catch (err: any) {
    // Mark thread correlation as failed but don't throw — email is already saved
    await supabaseAdmin
      .from('communication_threads')
      .update({ correlation_status: 'failed' })
      .eq('id', threadId);

    logger.error('Correlation handler failed', { threadId, fromEmail, error: err.message });
  }
}

/**
 * Handle extraction complete — store in document_extractions, forward to business layer
 */
async function handleExtractionComplete(data: AgentResultJobData): Promise<void> {
  const { entityId: documentId, payload } = data;
  const { documentType, extractedFields, confidence, threadId } = payload;

  await supabaseAdmin
    .from('document_extractions')
    .upsert({
      document_id: documentId,
      thread_id: threadId,
      status: 'completed',
      document_type: documentType,
      extracted_fields: extractedFields,
      confidence,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'document_id' });

  // Forward to business layer for shipment request creation
  await publishToKafka(KAFKA_TOPICS.BUSINESS, {
    documentId,
    threadId,
    documentType,
    extractedFields,
    confidence,
    source: 'document_extraction',
  }, documentId);

  logger.info('Extraction result handled', { documentId, documentType, confidence });
}

/**
 * Handle business result — create/update shipment_requests or rate_quotes,
 * then auto-create a draft quotation and link to the CRM customer.
 */
async function handleBusinessResult(data: AgentResultJobData): Promise<void> {
  const { entityId, payload } = data;
  const { resultType: bizType, shipmentData, quoteData, threadId } = payload;

  // Look up thread context (CRM customer, from_address) for downstream linking
  const { data: thread } = await supabaseAdmin
    .from('communication_threads')
    .select('crm_customer_id, reference')
    .eq('id', threadId)
    .single();

  // Resolve CRM customer name + email for quotation
  let customerName = '';
  let customerEmail = '';
  let customerId = thread?.crm_customer_id;
  if (customerId) {
    const cust = await crmCustomerRepository.findById(customerId);
    customerName = cust?.legal_name || cust?.trading_name || '';
    customerEmail = cust?.primary_email || '';
  }

  if (bizType === 'shipment_request' && shipmentData) {
    const { data: existing } = await supabaseAdmin
      .from('shipment_requests')
      .select('id')
      .eq('thread_id', threadId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('shipment_requests')
        .update({
          ...shipmentData,
          crm_customer_id: customerId,
          agent_updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('shipment_requests')
        .insert({
          ...shipmentData,
          thread_id: threadId,
          crm_customer_id: customerId,
          status: 'draft',
        });
    }
    logger.info('Business result: shipment_request upserted', { entityId, threadId });

    // Auto-create a DRAFT quotation linked to this thread and customer
    try {
      const origin = shipmentData.origin || shipmentData.pol || '';
      const destination = shipmentData.destination || shipmentData.pod || '';
      const shipmentType = shipmentData.shipment_type || 'FCL_IMPORT';

      await supabaseAdmin
        .from('quotations')
        .insert({
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          shipment_type: shipmentType,
          origin_location: origin,
          destination_location: destination,
          cargo_description: shipmentData.commodity || shipmentData.cargo_description || '',
          cargo_weight_kg: shipmentData.weight_kg || shipmentData.cargo_weight_kg || 0,
          status: 'DRAFT',
          notes: `Auto-generated from inbound email (thread ${thread?.reference || threadId}).`,
          service_requirements: {
            thread_id: threadId,
            source: 'agent_pipeline',
            agent_id: data.agentId,
            extracted_entities: shipmentData,
          },
        });

      logger.info('Auto-created draft quotation from shipment request', {
        threadId, customerId, origin, destination,
      });

      await notifyTeam(
        'TASK_ASSIGNED',
        'Draft quotation ready for review',
        `Agent extracted shipment details from ${customerName || customerEmail} and created a draft quotation (${origin} → ${destination}). Review and send.`,
        { threadId, actionUrl: '/quotations?status=DRAFT' }
      );
    } catch (qErr: any) {
      logger.warn('Failed to auto-create quotation (non-fatal)', { error: qErr.message, threadId });
    }
  }

  if (bizType === 'rate_quote' && quoteData) {
    await supabaseAdmin
      .from('rate_quotes')
      .insert({ ...quoteData, thread_id: threadId, status: 'pending' });
    logger.info('Business result: rate_quote created', { entityId, threadId });
  }
}

/**
 * Handle validation required — create validation review record, emit WebSocket notification
 */
async function handleValidationRequired(data: AgentResultJobData): Promise<void> {
  const { entityId: shipmentRequestId, payload } = data;
  const { priority, reason, validationData } = payload;

  await supabaseAdmin
    .from('validation_reviews')
    .insert({
      shipment_request_id: shipmentRequestId,
      status: 'pending',
      priority: priority || 'normal',
      reason,
      validation_data: validationData,
      requested_at: new Date().toISOString(),
    });

  logger.info('Validation review created', { shipmentRequestId, priority, reason });
}

/**
 * Handle validation complete — update shipment_request state
 */
async function handleValidationComplete(data: AgentResultJobData): Promise<void> {
  const { entityId: shipmentRequestId, payload } = data;
  const { decision, validatedBy, validationType, notes } = payload;

  const newStatus = decision === 'approved' ? 'approved' : 'rejected';

  await supabaseAdmin
    .from('shipment_requests')
    .update({
      status: newStatus,
      validated_by: validatedBy,
      validated_at: new Date().toISOString(),
      validation_notes: notes,
    })
    .eq('id', shipmentRequestId);

  if (validationType === 'human') {
    await supabaseAdmin
      .from('validation_reviews')
      .update({
        status: 'completed',
        decision,
        reviewed_by: validatedBy,
        completed_at: new Date().toISOString(),
      })
      .eq('shipment_request_id', shipmentRequestId)
      .eq('status', 'pending');
  }

  logger.info('Validation complete handled', { shipmentRequestId, decision, validatedBy });
}

/**
 * Main job processor
 */
async function processAgentResultJob(job: Job<AgentResultJobData>): Promise<void> {
  const { resultType } = job.data;

  logger.debug('Processing agent result job', { jobId: job.id, resultType });

  switch (resultType) {
    case 'ingestion_complete':
      await handleIngestionComplete(job.data);
      break;
    case 'processing_complete':
      await handleProcessingComplete(job.data);
      break;
    case 'correlation_complete':
      await handleCorrelationComplete(job.data);
      break;
    case 'extraction_complete':
      await handleExtractionComplete(job.data);
      break;
    case 'business_result':
      await handleBusinessResult(job.data);
      break;
    case 'validation_required':
      await handleValidationRequired(job.data);
      break;
    case 'validation_complete':
      await handleValidationComplete(job.data);
      break;
    default:
      logger.warn('Unknown agent result type', { resultType, jobId: job.id });
  }
}

/**
 * Create and start the agent result worker
 */
export function createAgentResultWorker(): Worker<AgentResultJobData> {
  const worker = new Worker('agent-tasks', processAgentResultJob, {
    connection: getRedisConnection(),
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info('Agent result job completed', { jobId: job.id, resultType: job.data.resultType });
  });

  worker.on('failed', (job, error) => {
    logger.error('Agent result job failed', {
      jobId: job?.id,
      resultType: job?.data.resultType,
      error: error.message,
    });
  });

  worker.on('error', (error) => {
    logger.error('Agent result worker error', { error: error.message });
  });

  logger.info('Agent result worker started', { concurrency: 10 });
  return worker;
}

/**
 * Queue an agent result for async processing
 */
export async function queueAgentResult(data: AgentResultJobData): Promise<string> {
  const queue = new Queue('agent-tasks', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    },
  });

  const job = await queue.add(data.resultType, data, {
    jobId: `agent-result-${data.agentId}-${data.entityId}-${Date.now()}`,
  });

  logger.info('Agent result queued', {
    jobId: job.id,
    resultType: data.resultType,
    entityId: data.entityId,
  });

  return job.id!;
}

export default { createAgentResultWorker, queueAgentResult };
