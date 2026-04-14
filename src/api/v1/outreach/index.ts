import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import templateService from '../../../services/email/template.service';
import trackingService from '../../../services/email/tracking.service';
import emailSender from '../../../services/email/email-sender.service';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

const BACKEND_URL = process.env.API_EXTERNAL_URL ||
  process.env.BACKEND_URL ||
  'https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io';

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * GET /api/v1/outreach/templates
 */
router.get('/templates', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, industry } = req.query;
    const templates = await templateService.getAll({
      category: category as string | undefined,
      industry: industry as string | undefined,
    });
    res.json({ success: true, data: templates, count: templates.length });
  } catch (error: any) {
    logger.error('Error fetching templates', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/v1/outreach/templates/:id
 */
router.get('/templates/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const template = await templateService.getById(req.params.id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true, data: template });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch template' });
  }
});

/**
 * POST /api/v1/outreach/templates (admin only)
 */
router.post('/templates', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const template = await templateService.create(req.body, req.user?.id);
    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error creating template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v1/outreach/templates/:id (admin only)
 */
router.put('/templates/:id', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const template = await templateService.update(req.params.id, req.body);
    res.json({ success: true, data: template });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/outreach/templates/:id (admin only)
 */
router.delete('/templates/:id', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await templateService.delete(req.params.id);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/outreach/templates/:id/preview
 * Preview a template with variable substitution (no sending)
 */
router.post('/templates/:id/preview', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const template = await templateService.getById(req.params.id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    const rendered = templateService.render(template, req.body.variables || {});
    res.json({ success: true, data: rendered });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STANDALONE OUTBOUND EMAIL
// ============================================================================

/**
 * POST /api/v1/outreach/send
 * Send a standalone outbound email (creates thread + message + sends)
 * Supports optional template, attachments, and tracking
 */
router.post('/send', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      to,
      cc,
      bcc,
      subject,
      html,
      body,
      templateId,
      variables,
      attachments,
      crmCustomerId,
      enableTracking = true,
    } = req.body;

    if (!to || (!subject && !templateId)) {
      res.status(400).json({
        success: false,
        error: 'Required: to, and either subject or templateId',
      });
      return;
    }

    // Resolve template if provided
    let finalSubject = subject || '';
    let finalHtml = html || body || '';

    if (templateId) {
      const template = await templateService.getById(templateId);
      if (!template) {
        res.status(404).json({ success: false, error: 'Template not found' });
        return;
      }
      const rendered = templateService.render(template, variables || {});
      finalSubject = rendered.subject;
      finalHtml = rendered.html;
    }

    // Create outbound thread
    const threadRef = `BX-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const { data: thread, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .insert({
        reference: threadRef,
        type: 'QUERY',
        status: 'NEW',
        priority: 'NORMAL',
        primary_channel: 'EMAIL',
        crm_customer_id: crmCustomerId || null,
        pipeline_stage: 'INTAKE',
        assigned_to: req.user?.id,
      })
      .select()
      .single();

    if (threadError) {
      logger.error('Failed to create outbound thread', { error: threadError.message });
      res.status(500).json({ success: false, error: 'Failed to create thread' });
      return;
    }

    // Create message record
    const messageId = require('crypto').randomUUID();
    const trackingId = trackingService.generateTrackingId(messageId);

    // Inject tracking if enabled
    let trackedHtml = finalHtml;
    if (enableTracking && finalHtml) {
      trackedHtml = trackingService.injectTracking(finalHtml, messageId, BACKEND_URL);
    }

    // Send email
    const emailResult = await emailSender.sendEmail({
      to: Array.isArray(to) ? to : [to],
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: finalSubject,
      html: trackedHtml,
      text: body || undefined,
      attachments: attachments || undefined,
    });

    // Save message to DB
    const { data: message, error: msgError } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        id: messageId,
        thread_id: thread.id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        status: 'SENT',
        content: body || finalHtml?.replace(/<[^>]*>/g, '') || '',
        html_content: finalHtml,
        subject: finalSubject,
        from_address: process.env.SMTP_USER || 'connect@banxwayglobal.com',
        from_name: req.user?.full_name || 'Banxway Global',
        to_addresses: Array.isArray(to) ? to.map((t: string) => ({ address: t })) : [{ address: to }],
        cc_addresses: cc ? (Array.isArray(cc) ? cc.map((c: string) => ({ address: c })) : [{ address: cc }]) : [],
        external_id: emailResult?.messageId || null,
        sent_by: req.user?.id,
        metadata: enableTracking ? { tracking_id: trackingId, tracking_enabled: true } : {},
      })
      .select()
      .single();

    if (msgError) {
      logger.error('Failed to save outbound message', { error: msgError.message });
    }

    // Update thread timestamps
    await supabaseAdmin
      .from('communication_threads')
      .update({
        last_activity_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', thread.id);

    logger.info('Outbound email sent', {
      threadId: thread.id,
      messageId,
      to,
      subject: finalSubject,
      templateId: templateId || null,
      tracking: enableTracking,
    });

    res.status(201).json({
      success: true,
      data: {
        threadId: thread.id,
        messageId,
        reference: threadRef,
        emailMessageId: emailResult?.messageId,
        tracking: enableTracking ? { trackingId } : null,
      },
    });
  } catch (error: any) {
    logger.error('Error sending outbound email', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/outreach/tracking/:messageId
 * Get tracking stats for a sent message
 */
router.get('/tracking/:messageId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await trackingService.getMessageStats(req.params.messageId);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/outreach/seed-templates
 * Seed default templates (admin only, idempotent)
 */
router.post('/seed-templates', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const count = await templateService.seedDefaults();
    res.json({ success: true, message: `Seeded ${count} templates`, count });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
