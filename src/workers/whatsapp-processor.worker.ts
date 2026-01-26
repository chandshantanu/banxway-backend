import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.config';
import exotelWhatsApp from '../services/exotel/whatsapp.service';
import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';
import { io } from '../index';

const whatsappWorker = new Worker(
  'whatsapp-processing',
  async (job) => {
    const { action, data } = job.data;

    switch (action) {
      case 'SEND_MESSAGE':
        return await sendWhatsAppMessage(data);

      case 'SEND_TEMPLATE':
        return await sendTemplateMessage(data);

      case 'SEND_MEDIA':
        return await sendMediaMessage(data);

      case 'PROCESS_INBOUND':
        return await processInboundMessage(data);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
  { connection: redisConnection }
);

whatsappWorker.on('completed', (job) => {
  logger.info('WhatsApp job completed', { jobId: job.id, action: job.data.action });
});

whatsappWorker.on('failed', (job, error) => {
  logger.error('WhatsApp job failed', {
    jobId: job?.id,
    action: job?.data.action,
    error: error.message,
  });
});

/**
 * Send WhatsApp text message
 */
async function sendWhatsAppMessage(data: any): Promise<void> {
  const { threadId, to, text, messageId } = data;

  try {
    const result = await exotelWhatsApp.sendTextMessage({
      to,
      from: process.env.EXOTEL_WHATSAPP_NUMBER!,
      message: text,
    });

    // Update message with external ID
    await supabaseAdmin
      .from('communication_messages')
      .update({
        external_id: result.sid,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('message:sent', {
      messageId,
      threadId,
      externalId: result.sid,
    });

    logger.info('WhatsApp message sent', { messageId, externalId: result.sid });
  } catch (error: any) {
    logger.error('Failed to send WhatsApp message', { error: error.message, messageId });

    // Update message status to failed
    await supabaseAdmin
      .from('communication_messages')
      .update({
        status: 'FAILED',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    throw error;
  }
}

/**
 * Send WhatsApp media message
 */
async function sendMediaMessage(data: any): Promise<void> {
  const { threadId, to, mediaUrl, mediaType, caption, messageId } = data;

  try {
    let result;

    switch (mediaType) {
      case 'image':
        result = await exotelWhatsApp.sendImage({
          to,
          from: process.env.EXOTEL_WHATSAPP_NUMBER!,
          imageUrl: mediaUrl,
          caption,
        });
        break;
      case 'document':
        result = await exotelWhatsApp.sendDocument({
          to,
          from: process.env.EXOTEL_WHATSAPP_NUMBER!,
          documentUrl: mediaUrl,
          caption,
        });
        break;
      case 'audio':
        result = await exotelWhatsApp.sendAudio({
          to,
          from: process.env.EXOTEL_WHATSAPP_NUMBER!,
          audioUrl: mediaUrl,
        });
        break;
      case 'video':
        result = await exotelWhatsApp.sendVideo({
          to,
          from: process.env.EXOTEL_WHATSAPP_NUMBER!,
          videoUrl: mediaUrl,
          caption,
        });
        break;
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }

    // Update message
    await supabaseAdmin
      .from('communication_messages')
      .update({
        external_id: result.sid,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    io.to(`thread:${threadId}`).emit('message:sent', {
      messageId,
      threadId,
      externalId: result.sid,
    });

    logger.info('WhatsApp media sent', { messageId, mediaType });
  } catch (error: any) {
    logger.error('Failed to send WhatsApp media', { error: error.message });

    // Update message status to failed
    await supabaseAdmin
      .from('communication_messages')
      .update({
        status: 'FAILED',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    throw error;
  }
}

/**
 * Send WhatsApp template message
 */
async function sendTemplateMessage(data: any): Promise<void> {
  const { threadId, to, templateName, language, variables, messageId } = data;

  try {
    const result = await exotelWhatsApp.sendTemplate({
      to,
      from: process.env.EXOTEL_WHATSAPP_NUMBER!,
      templateName,
      language,
      variables,
    });

    await supabaseAdmin
      .from('communication_messages')
      .update({
        external_id: result.sid,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    io.to(`thread:${threadId}`).emit('message:sent', {
      messageId,
      threadId,
      externalId: result.sid,
    });

    logger.info('WhatsApp template sent', { messageId, templateName });
  } catch (error: any) {
    logger.error('Failed to send WhatsApp template', { error: error.message });

    // Update message status to failed
    await supabaseAdmin
      .from('communication_messages')
      .update({
        status: 'FAILED',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    throw error;
  }
}

/**
 * Process inbound WhatsApp message
 */
async function processInboundMessage(data: any): Promise<void> {
  const { from, body, mediaUrl, messageSid } = data;

  // This would be called from webhook - store in database
  logger.info('Processing inbound WhatsApp', { from, messageSid });

  // Implementation already exists in webhook handler
  // This is for async processing if needed
}

logger.info('WhatsApp processor worker started');

export default whatsappWorker;
