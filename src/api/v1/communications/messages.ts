import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest, requirePermission } from '../../../middleware/auth.middleware';
import { supabaseAdmin } from '../../../config/database.config';
import exotelSMS from '../../../services/exotel/sms.service';
import exotelWhatsApp from '../../../services/exotel/whatsapp.service';
import exotelTelephony from '../../../services/exotel/telephony.service';
import emailSender from '../../../services/email/email-sender.service';
import { logger } from '../../../utils/logger';
import { io } from '../../../index';
import { exotelConfig, EXOTEL_WEBHOOK_BASE_URL } from '../../../config/exotel.config';
import { Permission } from '../../../utils/permissions';

const router = Router();

// Authentication is applied at the parent router level (communications/index.ts)
// No need to apply it again here

/**
 * Get all messages across all threads (unified inbox view)
 * GET /api/v1/communications/messages/all?limit=100&offset=0&channel=EMAIL
 */
router.get('/all', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { limit = 100, offset = 0, channel, dateFrom, dateTo } = req.query;

    let query = supabaseAdmin
      .from('communication_messages')
      .select(`
        *,
        communication_threads!inner (
          id,
          reference,
          type,
          status,
          priority,
          customer_id,
          customers (
            id,
            name,
            email,
            phone
          )
        )
      `, { count: 'exact' });

    // Filter by channel if specified
    if (channel) {
      query = query.eq('channel', channel);
    }

    // Filter by date range if specified
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Order by created_at descending and paginate
    query = query
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: messages, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      success: true,
      data: messages || [],
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: count || 0,
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch all messages', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get messages for a thread
 * GET /api/v1/communications/messages?threadId=xxx&limit=50&offset=0
 */
router.get('/', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { threadId, limit = 50, offset = 0 } = req.query;

    if (!threadId) {
      res.status(400).json({
        success: false,
        error: 'threadId is required',
      });
      return;
    }

    // Verify user has access to this thread
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      res.status(404).json({
        success: false,
        error: 'Thread not found',
      });
      return;
    }

    // Get messages with sender information
    const { data: messages, error, count } = await supabaseAdmin
      .from('communication_messages')
      .select(`
        *,
        sent_by_user:users!sent_by (
          id,
          full_name,
          email
        )
      `, { count: 'exact' })
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      success: true,
      data: messages || [],
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: count || 0,
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch messages', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Send SMS message
 * POST /api/v1/communications/messages/send-sms
 */
router.post('/send-sms', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { threadId, to, body, priority } = req.body;

    if (!threadId || !to || !body) {
      res.status(400).json({
        success: false,
        error: 'threadId, to, and body are required',
      });
      return;
    }

    // Verify thread exists
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      res.status(404).json({
        success: false,
        error: 'Thread not found',
      });
      return;
    }

    // Send SMS via Exotel
    const smsResult = await exotelSMS.sendSMS({
      to,
      body,
      customData: threadId,
      statusCallback: `${EXOTEL_WEBHOOK_BASE_URL}/api/v1/webhooks/exotel/sms`,
      priority,
    });

    // Create message record
    const { data: message, error: messageError } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        channel: 'SMS',
        direction: 'OUTBOUND',
        content: body,
        from_address: exotelConfig.smsNumber,
        to_addresses: [{ address: to }],
        external_id: smsResult.SMSMessage?.Sid,
        status: 'SENT',
        sent_at: new Date(),
        sent_by: req.user!.id,
      })
      .select()
      .single();

    if (messageError) {
      throw new Error(messageError.message);
    }

    // Update thread timestamps
    await supabaseAdmin
      .from('communication_threads')
      .update({
        last_activity_at: new Date(),
        last_message_at: new Date(),
      })
      .eq('id', threadId);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('thread:message', {
      threadId,
      message,
    });

    logger.info('SMS sent successfully', {
      messageId: message.id,
      threadId,
      to,
    });

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    logger.error('Failed to send SMS', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Send WhatsApp message
 * POST /api/v1/communications/messages/send-whatsapp
 */
router.post('/send-whatsapp', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { threadId, to, text, mediaUrl, mediaType } = req.body;

    if (!threadId || !to || (!text && !mediaUrl)) {
      res.status(400).json({
        success: false,
        error: 'threadId, to, and either text or mediaUrl are required',
      });
      return;
    }

    // Verify thread exists
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      res.status(404).json({
        success: false,
        error: 'Thread not found',
      });
      return;
    }

    // Send WhatsApp message
    let whatsappResult;
    if (mediaUrl) {
      if (mediaType === 'image') {
        whatsappResult = await exotelWhatsApp.sendImage({
          to,
          imageUrl: mediaUrl,
          caption: text,
          customData: threadId,
        });
      } else if (mediaType === 'document') {
        whatsappResult = await exotelWhatsApp.sendDocument({
          to,
          documentUrl: mediaUrl,
          filename: 'document',
          caption: text,
          customData: threadId,
        });
      }
    } else {
      whatsappResult = await exotelWhatsApp.sendTextMessage({
        to,
        text,
        customData: threadId,
        statusCallback: `${EXOTEL_WEBHOOK_BASE_URL}/api/v1/webhooks/exotel/whatsapp`,
      });
    }

    // Create message record
    const { data: message, error: messageError } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        content: text || '',
        from_address: exotelConfig.whatsappNumber,
        to_addresses: [{ address: to }],
        external_id: whatsappResult.sid,
        status: 'SENT',
        attachments: mediaUrl ? [{ url: mediaUrl, content_type: mediaType || 'unknown', filename: 'media', size: 0 }] : [],
        sent_at: new Date(),
        sent_by: req.user!.id,
      })
      .select()
      .single();

    if (messageError) {
      throw new Error(messageError.message);
    }

    // Update thread timestamps
    await supabaseAdmin
      .from('communication_threads')
      .update({
        last_activity_at: new Date(),
        last_message_at: new Date(),
      })
      .eq('id', threadId);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('thread:message', {
      threadId,
      message,
    });

    logger.info('WhatsApp message sent', {
      messageId: message.id,
      threadId,
      to,
    });

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    logger.error('Failed to send WhatsApp message', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Make voice call
 * POST /api/v1/communications/messages/make-call
 */
router.post('/make-call', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { threadId, to, from } = req.body;

    if (!threadId || !to) {
      res.status(400).json({
        success: false,
        error: 'threadId and to are required',
      });
      return;
    }

    // Verify thread exists
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      res.status(404).json({
        success: false,
        error: 'Thread not found',
      });
      return;
    }

    // Make call via Exotel
    const callResult = await exotelTelephony.makeCall({
      from: from || exotelConfig.phoneNumber,
      to,
      virtualNumber: exotelConfig.phoneNumber,
      record: true,
      customField: threadId,
      statusCallback: `${EXOTEL_WEBHOOK_BASE_URL}/api/v1/webhooks/exotel/call`,
    });

    // Create message record
    const { data: message, error: messageError } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        channel: 'VOICE',
        direction: 'OUTBOUND',
        content: 'Call initiated',
        from_address: from || exotelConfig.phoneNumber,
        to_addresses: [{ address: to }],
        external_id: callResult.call_sid,
        status: 'PENDING',
        sent_at: new Date(),
        sent_by: req.user!.id,
      })
      .select()
      .single();

    if (messageError) {
      throw new Error(messageError.message);
    }

    // Update thread timestamps
    await supabaseAdmin
      .from('communication_threads')
      .update({
        last_activity_at: new Date(),
      })
      .eq('id', threadId);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('thread:call_initiated', {
      threadId,
      message,
      callSid: callResult.call_sid,
    });

    logger.info('Call initiated', {
      messageId: message.id,
      threadId,
      to,
      callSid: callResult.call_sid,
    });

    res.json({
      success: true,
      data: {
        message,
        callSid: callResult.call_sid,
      },
    });
  } catch (error: any) {
    logger.error('Failed to make call', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Send email
 * POST /api/v1/communications/messages/send-email
 */
router.post('/send-email', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      threadId,
      to,
      cc,
      bcc,
      subject,
      body,
      html,
      attachments,
      inReplyTo,
      references,
    } = req.body;

    if (!threadId || !to || !subject || (!body && !html)) {
      res.status(400).json({
        success: false,
        error: 'threadId, to, subject, and either body or html are required',
      });
      return;
    }

    // Verify thread exists
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      res.status(404).json({
        success: false,
        error: 'Thread not found',
      });
      return;
    }

    // Get customer email for proper threading
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('email')
      .eq('id', thread.customer_id)
      .single();

    // Send email with threading support
    const emailResult = await emailSender.sendThreadedEmail({
      threadId,
      to: Array.isArray(to) ? to : [to],
      cc,
      bcc,
      subject,
      text: body,
      html: html || emailSender.textToHtml(body),
      attachments,
      inReplyTo,
      references,
      replyTo: process.env.SMTP_USER,
    });

    // Create message record
    const { data: message, error: messageError } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        content: body || '',
        subject,
        from_address: process.env.SMTP_USER,
        to_addresses: (Array.isArray(to) ? to : [to]).map((addr: string) => ({ address: addr })),
        cc_addresses: cc ? (Array.isArray(cc) ? cc : [cc]).map((addr: string) => ({ address: addr })) : [],
        bcc_addresses: bcc ? (Array.isArray(bcc) ? bcc : [bcc]).map((addr: string) => ({ address: addr })) : [],
        external_id: emailResult.messageId,
        status: 'SENT',
        attachments: attachments || [],
        sent_at: new Date(),
        sent_by: req.user!.id,
        metadata: {
          inReplyTo,
          references,
        },
      })
      .select()
      .single();

    if (messageError) {
      throw new Error(messageError.message);
    }

    // Update thread timestamps
    await supabaseAdmin
      .from('communication_threads')
      .update({
        last_activity_at: new Date(),
        last_message_at: new Date(),
      })
      .eq('id', threadId);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('thread:message', {
      threadId,
      message,
    });

    logger.info('Email sent successfully', {
      messageId: message.id,
      threadId,
      to,
      subject,
    });

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    logger.error('Failed to send email', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update message
 * PATCH /api/v1/communications/messages/:id
 */
router.patch('/:id', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    delete updates.external_id;

    const { data: message, error } = await supabaseAdmin
      .from('communication_messages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    logger.error('Failed to update message', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Delete message (soft delete)
 * DELETE /api/v1/communications/messages/:id
 */
router.delete('/:id', requirePermission(Permission.DELETE_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: message, error } = await supabaseAdmin
      .from('communication_messages')
      .update({ deleted_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    logger.error('Failed to delete message', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
