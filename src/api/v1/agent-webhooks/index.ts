import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import { queueAgentResult } from '../../../workers/agent-result.worker';

const router = Router();

/**
 * Agent Webhook Receivers
 * Endpoints for AgentBuilder agents to call back into Banxway.
 * Each handler validates the payload, queues async processing via BullMQ,
 * and immediately returns 200 to the agent (fire-and-forget pattern).
 */

/**
 * POST /api/v1/agent-webhooks/ingestion-complete
 * Called by L1 ingestion agents (email/WhatsApp/phone) when they finish processing a raw message.
 */
router.post('/ingestion-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, channel, messageId, threadId, data, metadata } = req.body;

    if (!agentId || !threadId) {
      res.status(400).json({ success: false, error: 'agentId and threadId are required' });
      return;
    }

    logger.info('Ingestion complete webhook received', { agentId, channel, threadId, messageId });

    await queueAgentResult({
      resultType: 'ingestion_complete',
      agentId,
      entityId: threadId,
      payload: { channel, messageId, threadId, rawContent: data?.content, metadata },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Ingestion webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/processing-complete
 * Called by L2 processing agents (parser, NLP extractor, intent classifier) when done.
 */
router.post('/processing-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, messageId, intent, entities, confidence, hasDocuments, documentUrls, metadata } = req.body;

    if (!agentId || !messageId) {
      res.status(400).json({ success: false, error: 'agentId and messageId are required' });
      return;
    }

    logger.info('Processing complete webhook received', {
      agentId, messageId, intent, confidence,
    });

    await queueAgentResult({
      resultType: 'processing_complete',
      agentId,
      entityId: messageId,
      payload: { intent, entities, confidence, hasDocuments, documentUrls, metadata },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Processing webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/extraction-complete
 * Called by L3 document agents (PDF/Excel/Word extractor) when extraction is done.
 */
router.post('/extraction-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, documentId, documentType, threadId, extractedFields, confidence, metadata } = req.body;

    if (!agentId || !documentId) {
      res.status(400).json({ success: false, error: 'agentId and documentId are required' });
      return;
    }

    logger.info('Document extraction complete webhook received', {
      agentId, documentId, documentType,
      fieldCount: extractedFields ? Object.keys(extractedFields).length : 0,
    });

    await queueAgentResult({
      resultType: 'extraction_complete',
      agentId,
      entityId: documentId,
      payload: { documentType, extractedFields, confidence, threadId, metadata },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Extraction webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/business-result
 * Called by L4 business agents (shipment request, rate quote, workflow orchestration).
 */
router.post('/business-result', async (req: Request, res: Response) => {
  try {
    const { agentId, resultType, entityId, threadId, shipmentData, quoteData, metadata } = req.body;

    if (!agentId || !entityId) {
      res.status(400).json({ success: false, error: 'agentId and entityId are required' });
      return;
    }

    logger.info('Business result webhook received', { agentId, resultType, entityId });

    await queueAgentResult({
      resultType: 'business_result',
      agentId,
      entityId,
      payload: { resultType, threadId, shipmentData, quoteData, metadata },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Business result webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/validation-required
 * Called by L5 human validation agent when human review is needed for a shipment request.
 */
router.post('/validation-required', async (req: Request, res: Response) => {
  try {
    const { agentId, shipmentRequestId, priority, reason, data, metadata } = req.body;

    if (!agentId || !shipmentRequestId) {
      res.status(400).json({ success: false, error: 'agentId and shipmentRequestId are required' });
      return;
    }

    logger.info('Validation required webhook received', {
      agentId, shipmentRequestId, priority, reason,
    });

    await queueAgentResult({
      resultType: 'validation_required',
      agentId,
      entityId: shipmentRequestId,
      payload: { priority, reason, validationData: data, metadata },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Validation-required webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/correlation-complete
 * Called by L2 correlationEngine agent when it has matched/classified a thread.
 * Payload tells us: which customer matched (or none), and whether this is a
 * new lead, an existing customer, or an update to an existing shipment.
 */
router.post('/correlation-complete', async (req: Request, res: Response) => {
  try {
    const {
      agentId,
      threadId,
      messageId,
      fromEmail,
      fromName,
      matchedCustomerId,   // UUID of existing crm_customer (null if not found)
      matchedShipmentId,   // UUID of active shipment linked to the customer (null if none)
      classification,      // 'new_lead' | 'existing_customer' | 'existing_shipment'
      confidence,
      metadata,
    } = req.body;

    if (!agentId || !threadId) {
      res.status(400).json({ success: false, error: 'agentId and threadId are required' });
      return;
    }

    logger.info('Correlation complete webhook received', {
      agentId, threadId, messageId, classification, matchedCustomerId,
    });

    await queueAgentResult({
      resultType: 'correlation_complete',
      agentId,
      entityId: threadId,
      payload: {
        threadId, messageId, fromEmail, fromName,
        matchedCustomerId, matchedShipmentId,
        classification, confidence, metadata,
      },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Correlation webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/validation-complete
 * Called when human or client validation is completed.
 */
router.post('/validation-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, shipmentRequestId, decision, validatedBy, validationType, notes, metadata } = req.body;

    if (!agentId || !shipmentRequestId || !decision) {
      res.status(400).json({ success: false, error: 'agentId, shipmentRequestId, and decision are required' });
      return;
    }

    if (!['approved', 'rejected', 'revision_needed'].includes(decision)) {
      res.status(400).json({ success: false, error: 'decision must be approved, rejected, or revision_needed' });
      return;
    }

    logger.info('Validation complete webhook received', {
      agentId, shipmentRequestId, decision, validationType,
    });

    await queueAgentResult({
      resultType: 'validation_complete',
      agentId,
      entityId: shipmentRequestId,
      payload: { decision, validatedBy, validationType, notes, metadata },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Validation-complete webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

export default router;
