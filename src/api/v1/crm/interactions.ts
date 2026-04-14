import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

/**
 * GET /api/v1/crm/interactions?customer_id=...
 * List interactions for a customer
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { customer_id, limit, page } = req.query;

    let query = supabaseAdmin
      .from('customer_interactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (customer_id) query = query.eq('customer_id', customer_id);

    const pageNum = parseInt(page as string || '1', 10);
    const pageSize = parseInt(limit as string || '20', 10);
    const offset = (pageNum - 1) * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      if (error.code === '42P01') {
        res.json({ success: true, data: [], total: 0 });
        return;
      }
      throw error;
    }

    res.json({ success: true, data: data || [], total: count || 0, page: pageNum });
  } catch (error: any) {
    logger.error('Error fetching interactions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch interactions' });
  }
});

/**
 * POST /api/v1/crm/interactions
 * Log an off-platform interaction (WhatsApp, phone, in-person)
 */
router.post('/', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      customer_id,
      contact_id,
      interaction_type, // CALL, WHATSAPP, MEETING, IN_PERSON, SMS, OTHER
      channel,
      summary,
      outcome, // POSITIVE, NEGATIVE, NEUTRAL, FOLLOW_UP_REQUIRED
      next_action,
      next_action_due_date,
      thread_id,
      quotation_id,
      shipment_id,
      interaction_data,
    } = req.body;

    if (!customer_id || !interaction_type || !summary) {
      res.status(400).json({
        success: false,
        error: 'Required: customer_id, interaction_type, summary',
      });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('customer_interactions')
      .insert({
        customer_id,
        contact_id: contact_id || null,
        interaction_type,
        channel: channel || interaction_type,
        summary,
        outcome: outcome || 'NEUTRAL',
        next_action: next_action || null,
        next_action_due_date: next_action_due_date || null,
        thread_id: thread_id || null,
        quotation_id: quotation_id || null,
        shipment_id: shipment_id || null,
        interaction_data: interaction_data ? JSON.stringify(interaction_data) : null,
        performed_by: req.user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    // If next_action specified, create a follow-up task in communication_actions
    if (next_action && next_action_due_date) {
      await supabaseAdmin
        .from('communication_actions')
        .insert({
          type: 'FOLLOW_UP',
          title: next_action,
          description: `Follow-up from ${interaction_type}: ${summary.substring(0, 100)}`,
          status: 'PENDING',
          priority: 'NORMAL',
          assigned_to: req.user?.id,
          due_at: next_action_due_date,
          ai_generated: false,
        });
      logger.info('Follow-up task created from interaction', { customerId: customer_id, dueDate: next_action_due_date });
    }

    // Update customer last_interaction_at
    await supabaseAdmin
      .from('crm_customers')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', customer_id);

    logger.info('Interaction logged', {
      customerId: customer_id,
      type: interaction_type,
      outcome,
      hasFollowUp: !!next_action,
    });

    res.status(201).json({ success: true, data });
  } catch (error: any) {
    logger.error('Error logging interaction', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
