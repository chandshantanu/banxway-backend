import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import { ExotelWebhookPayload } from '../../../types/workflow';
import { ThreadType } from '../../../types';
import exotelTelephony from '../../../services/exotel/telephony.service';
import exotelWhatsApp from '../../../services/exotel/whatsapp.service';
import exotelSMS from '../../../services/exotel/sms.service';
import { supabaseAdmin } from '../../../config/database.config';
import threadRepository from '../../../database/repositories/thread.repository';
import { io } from '../../../index';
import { queueTranscription } from '../../../workers/transcription.worker';
import { verifyExotelWebhook, logWebhookRequest } from '../../../middleware/exotel-webhook-auth.middleware';

const router = Router();

// Apply webhook logging and verification middleware
router.use(logWebhookRequest);
router.use(verifyExotelWebhook);

/**
 * Exotel Call Webhook Handler
 * Endpoint: POST /api/v1/webhooks/exotel/call
 */
router.post('/call', async (req: Request, res: Response) => {
  let webhookLogId: string | null = null;

  try {
    const payload: ExotelWebhookPayload = req.body;

    // Log webhook to database
    const { data: webhookLog } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        webhook_type: 'call',
        payload: payload,
        headers: req.headers,
        external_id: payload.CallSid,
        processed: false,
      })
      .select('id')
      .single();

    webhookLogId = webhookLog?.id;

    logger.info('Received Exotel call webhook', {
      callSid: payload.CallSid,
      status: payload.CallStatus,
      direction: payload.Direction,
      webhookLogId,
    });

    // Process the webhook
    await processCallWebhook(payload);

    // Mark webhook as processed
    if (webhookLogId) {
      await supabaseAdmin
        .from('webhook_logs')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', webhookLogId);
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    logger.error('Failed to process call webhook', {
      error: error.message,
      body: req.body,
    });

    // Mark webhook as failed
    if (webhookLogId) {
      await supabaseAdmin
        .from('webhook_logs')
        .update({
          error: error.message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', webhookLogId);
    }

    // Still return 200 to prevent retries
    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * Exotel WhatsApp Webhook Handler
 * Endpoint: POST /api/v1/webhooks/exotel/whatsapp
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const payload: ExotelWebhookPayload = req.body;

    logger.info('Received Exotel WhatsApp webhook', {
      messageSid: payload.MessageSid,
      status: payload.MessageStatus,
      from: payload.From,
      to: payload.To,
    });

    // Process the webhook
    await processWhatsAppWebhook(payload);

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    logger.error('Failed to process WhatsApp webhook', {
      error: error.message,
      body: req.body,
    });

    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * Exotel SMS Webhook Handler
 * Endpoint: POST /api/v1/webhooks/exotel/sms
 */
router.post('/sms', async (req: Request, res: Response) => {
  try {
    const payload: ExotelWebhookPayload = req.body;

    logger.info('Received Exotel SMS webhook', {
      messageSid: payload.SmsSid || payload.MessageSid,
      status: payload.Status || payload.SmsStatus,
      from: payload.From,
      to: payload.To,
    });

    // Process the webhook
    await processSMSWebhook(payload);

    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    logger.error('Failed to process SMS webhook', {
      error: error.message,
      body: req.body,
    });

    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * Process call webhook
 */
async function processCallWebhook(payload: ExotelWebhookPayload): Promise<void> {
  try {
    // Store call details
    const callRecord = {
      external_id: payload.CallSid,
      channel: 'VOICE',
      direction: payload.Direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
      from_address: payload.From,
      to_address: payload.To,
      status: mapCallStatus(payload.CallStatus),
      duration: payload.CallDuration ? parseInt(payload.CallDuration) : null,
      recording_url: payload.RecordingUrl,
      custom_field: payload.CustomField,
      created_at: new Date(),
    };

    // If this is linked to a workflow instance (via CustomField)
    if (payload.CustomField) {
      // Update workflow instance with call result
      await updateWorkflowInstanceWithCallResult(payload.CustomField, callRecord);
    }

    // Find or create communication thread
    const phoneNumber = payload.Direction === 'inbound' ? payload.From : payload.To;
    const thread = await findOrCreateThreadByPhone(phoneNumber);

    if (thread) {
      // Create message record for the call
      const { data: message } = await supabaseAdmin.from('communication_messages').insert({
        thread_id: thread.id,
        channel: 'VOICE',
        direction: callRecord.direction,
        content: `Call ${payload.CallStatus}. Duration: ${payload.CallDuration || 0}s`,
        from_address: payload.From,
        to_addresses: [{ address: payload.To }],
        external_id: payload.CallSid,
        sent_at: new Date(),
        transcription_status: payload.RecordingUrl ? 'PENDING' : null,
        metadata: {
          recordingUrl: payload.RecordingUrl,
          duration: payload.CallDuration,
        },
      }).select().single();

      // Queue transcription if recording is available
      if (payload.RecordingUrl && message) {
        try {
          await queueTranscription({
            messageId: message.id,
            threadId: thread.id,
            audioUrl: payload.RecordingUrl,
            callSid: payload.CallSid,
          });

          logger.info('Transcription queued for call', {
            callSid: payload.CallSid,
            messageId: message.id,
          });
        } catch (error: any) {
          logger.error('Failed to queue transcription', {
            error: error.message,
            callSid: payload.CallSid,
          });
        }
      }

      // Emit WebSocket event
      io.to(`thread:${thread.id}`).emit('thread:call_update', {
        threadId: thread.id,
        callStatus: payload.CallStatus,
        callSid: payload.CallSid,
        message: message,
      });
    }

    logger.info('Call webhook processed successfully', {
      callSid: payload.CallSid,
      threadId: thread?.id,
    });
  } catch (error: any) {
    logger.error('Error processing call webhook', {
      error: error.message,
      callSid: payload.CallSid,
    });
    throw error;
  }
}

/**
 * Process WhatsApp webhook
 */
async function processWhatsAppWebhook(payload: ExotelWebhookPayload): Promise<void> {
  try {
    // Determine if this is an incoming message or status update
    const isIncoming = payload.Body !== undefined;

    if (isIncoming) {
      // Incoming WhatsApp message
      await processIncomingWhatsAppMessage(payload);
    } else {
      // WhatsApp message status update
      await processWhatsAppStatusUpdate(payload);
    }
  } catch (error: any) {
    logger.error('Error processing WhatsApp webhook', {
      error: error.message,
      messageSid: payload.MessageSid,
    });
    throw error;
  }
}

/**
 * Process incoming WhatsApp message
 */
async function processIncomingWhatsAppMessage(payload: ExotelWebhookPayload): Promise<void> {
  const phoneNumber = payload.From!;

  // Find or create customer
  const customer = await findOrCreateCustomerByPhone(phoneNumber);

  // Find or create thread
  const thread = await findOrCreateThreadForCustomer(customer.id, 'WHATSAPP');

  // Create message
  const message = await supabaseAdmin
    .from('communication_messages')
    .insert({
      thread_id: thread.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      content: payload.Body || '',
      from_address: payload.From,
      to_addresses: [{ address: payload.To }],
      external_id: payload.MessageSid,
      attachments: payload.MediaUrl
        ? [{ url: payload.MediaUrl, content_type: 'unknown', filename: 'media', size: 0 }]
        : [],
      sent_at: new Date(),
    })
    .select()
    .single();

  if (message.data) {
    // Emit WebSocket event
    io.to(`thread:${thread.id}`).emit('thread:message', {
      threadId: thread.id,
      message: message.data,
    });

    // Queue for AI processing (sentiment, intent, etc.)
    // TODO: Add to AI queue

    logger.info('Incoming WhatsApp message processed', {
      messageId: message.data.id,
      threadId: thread.id,
    });
  }
}

/**
 * Process WhatsApp status update
 */
async function processWhatsAppStatusUpdate(payload: ExotelWebhookPayload): Promise<void> {
  // Update message status in database
  const { error } = await supabaseAdmin
    .from('communication_messages')
    .update({
      status: mapWhatsAppStatus(payload.MessageStatus),
      delivered_at:
        payload.MessageStatus === 'delivered' ? new Date() : undefined,
      read_at: payload.MessageStatus === 'read' ? new Date() : undefined,
    })
    .eq('external_id', payload.MessageSid);

  if (error) {
    logger.error('Failed to update message status', {
      error: error.message,
      messageSid: payload.MessageSid,
    });
  }

  logger.info('WhatsApp status updated', {
    messageSid: payload.MessageSid,
    status: payload.MessageStatus,
  });
}

/**
 * Helper functions
 */

async function findOrCreateThreadByPhone(phoneNumber: string): Promise<any> {
  // Find customer by phone
  const customer = await findOrCreateCustomerByPhone(phoneNumber);

  // Find or create thread
  return await findOrCreateThreadForCustomer(customer.id, 'VOICE');
}

async function findOrCreateCustomerByPhone(phoneNumber: string): Promise<any> {
  // Try to find existing customer
  let { data: customer } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('phone', phoneNumber)
    .single();

  if (!customer) {
    // Create new customer
    const { data: newCustomer } = await supabaseAdmin
      .from('customers')
      .insert({
        name: phoneNumber,
        phone: phoneNumber,
        tier: 'NEW',
      })
      .select()
      .single();

    customer = newCustomer;
  }

  return customer;
}

async function findOrCreateThreadForCustomer(
  customerId: string,
  channel: string
): Promise<any> {
  // Find open thread for this customer
  let { data: thread } = await supabaseAdmin
    .from('communication_threads')
    .select('*')
    .eq('customer_id', customerId)
    .eq('primary_channel', channel)
    .in('status', ['NEW', 'IN_PROGRESS'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!thread) {
    // Create new thread
    thread = await threadRepository.create(
      {
        type: ThreadType.QUERY,
        customer_id: customerId,
        primary_channel: channel as any,
      },
      customerId
    );
  }

  return thread;
}

async function updateWorkflowInstanceWithCallResult(
  instanceId: string,
  callRecord: any
): Promise<void> {
  try {
    const { data: instance } = await supabaseAdmin
      .from('workflow_instances')
      .select('context')
      .eq('id', instanceId)
      .single();

    if (instance) {
      const updatedContext = {
        ...instance.context,
        lastCall: callRecord,
      };

      await supabaseAdmin
        .from('workflow_instances')
        .update({ context: updatedContext })
        .eq('id', instanceId);
    }
  } catch (error: any) {
    logger.error('Failed to update workflow instance with call result', {
      error: error.message,
      instanceId,
    });
  }
}

function mapCallStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    answered: 'COMPLETED',
    'no-answer': 'FAILED',
    busy: 'FAILED',
    failed: 'FAILED',
    completed: 'COMPLETED',
  };

  return statusMap[status || ''] || 'PENDING';
}

function mapWhatsAppStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
  };

  return statusMap[status || ''] || 'PENDING';
}

/**
 * Process SMS webhook
 */
async function processSMSWebhook(payload: ExotelWebhookPayload): Promise<void> {
  try {
    // Determine if this is an incoming message or status update
    const isIncoming = payload.Body !== undefined;

    if (isIncoming) {
      // Incoming SMS message
      await processIncomingSMS(payload);
    } else {
      // SMS status update
      await processSMSStatusUpdate(payload);
    }
  } catch (error: any) {
    logger.error('Error processing SMS webhook', {
      error: error.message,
      messageSid: payload.SmsSid || payload.MessageSid,
    });
    throw error;
  }
}

/**
 * Process incoming SMS message
 */
async function processIncomingSMS(payload: ExotelWebhookPayload): Promise<void> {
  const phoneNumber = payload.From!;

  // Find or create customer
  const customer = await findOrCreateCustomerByPhone(phoneNumber);

  // Find or create thread
  const thread = await findOrCreateThreadForCustomer(customer.id, 'SMS');

  // Create message
  const message = await supabaseAdmin
    .from('communication_messages')
    .insert({
      thread_id: thread.id,
      channel: 'SMS',
      direction: 'INBOUND',
      content: payload.Body || '',
      from_address: payload.From,
      to_addresses: [{ address: payload.To }],
      external_id: payload.SmsSid || payload.MessageSid,
      sent_at: new Date(),
    })
    .select()
    .single();

  if (message.data) {
    // Emit WebSocket event
    io.to(`thread:${thread.id}`).emit('thread:message', {
      threadId: thread.id,
      message: message.data,
    });

    // Queue for AI processing (sentiment, intent, etc.)
    // TODO: Add to AI queue

    logger.info('Incoming SMS processed', {
      messageId: message.data.id,
      threadId: thread.id,
    });
  }
}

/**
 * Process SMS status update
 */
async function processSMSStatusUpdate(payload: ExotelWebhookPayload): Promise<void> {
  // Update message status in database
  const { error } = await supabaseAdmin
    .from('communication_messages')
    .update({
      status: mapSMSStatus(payload.Status || payload.SmsStatus),
      delivered_at:
        payload.Status === 'delivered' || payload.SmsStatus === 'delivered'
          ? new Date()
          : undefined,
    })
    .eq('external_id', payload.SmsSid || payload.MessageSid);

  if (error) {
    logger.error('Failed to update SMS status', {
      error: error.message,
      messageSid: payload.SmsSid || payload.MessageSid,
    });
  }

  logger.info('SMS status updated', {
    messageSid: payload.SmsSid || payload.MessageSid,
    status: payload.Status || payload.SmsStatus,
  });
}

function mapSMSStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    failed: 'FAILED',
    queued: 'PENDING',
  };

  return statusMap[status || ''] || 'PENDING';
}

export default router;
