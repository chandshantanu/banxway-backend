/**
 * Validation API Routes
 * Human + Client validation endpoints for L5 agent pipeline
 *
 * GET  /api/v1/validation/pending     - List pending validation reviews
 * GET  /api/v1/validation/:id         - Get single validation review
 * POST /api/v1/validation/:id/approve - Approve with optional corrections
 * POST /api/v1/validation/:id/reject  - Reject validation
 * POST /api/v1/validation/:id/revision - Request revision
 */

import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../../config/database.config';
import { authenticateRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../utils/logger';
import { publishToKafka, KAFKA_TOPICS } from '../../../config/kafka.config';

const router = Router();

// All routes require authentication
router.use(authenticateRequest);

/**
 * GET /api/v1/validation/pending
 * List all pending validation reviews
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', priority } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabaseAdmin
      .from('validation_reviews')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (priority) {
      query = query.eq('priority', priority);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return res.json({ success: true, data: [], count: 0 });
      }
      throw error;
    }

    const { data: countData } = await supabaseAdmin
      .from('validation_reviews')
      .select('id')
      .eq('status', 'PENDING');

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
      total: countData?.length || 0,
      page: parseInt(page as string),
      pageSize: parseInt(limit as string),
    });
  } catch (error: any) {
    logger.error('Error fetching pending validations', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch pending validations' });
  }
});

/**
 * GET /api/v1/validation/:id
 * Get a single validation review with related data
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('validation_reviews')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Validation review not found' });
      }
      throw error;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching validation review', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to fetch validation review' });
  }
});

/**
 * POST /api/v1/validation/:id/approve
 * Approve a validation review (with optional corrections)
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { corrections, notes } = req.body;
    const reviewerId = (req as any).user?.id;

    const { data, error } = await supabaseAdmin
      .from('validation_reviews')
      .update({
        status: corrections && Object.keys(corrections).length > 0 ? 'APPROVED_WITH_CORRECTIONS' : 'APPROVED',
        reviewer_id: reviewerId,
        corrections: corrections || null,
        notes: notes || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Validation review not found or already reviewed' });
      }
      throw error;
    }

    // Publish validation result to agent pipeline
    await publishToKafka(KAFKA_TOPICS.BUSINESS, {
      type: 'validation-complete',
      reviewId: id,
      status: data.status,
      corrections,
      shipmentId: data.shipment_id,
      threadId: data.thread_id,
      reviewerId,
      timestamp: new Date().toISOString(),
    }, data.shipment_id || id);

    // Update related shipment status if linked
    if (data.shipment_id) {
      await supabaseAdmin
        .from('shipments')
        .update({
          status: 'BOOKED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.shipment_id);
    }

    logger.info('Validation approved', { reviewId: id, status: data.status, reviewerId });
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error approving validation', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to approve validation' });
  }
});

/**
 * POST /api/v1/validation/:id/reject
 * Reject a validation review
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;
    const reviewerId = (req as any).user?.id;

    const { data, error } = await supabaseAdmin
      .from('validation_reviews')
      .update({
        status: 'REJECTED',
        reviewer_id: reviewerId,
        rejection_reason: reason || null,
        notes: notes || null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Validation review not found or already reviewed' });
      }
      throw error;
    }

    logger.info('Validation rejected', { reviewId: id, reason, reviewerId });
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error rejecting validation', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to reject validation' });
  }
});

/**
 * POST /api/v1/validation/:id/revision
 * Request revision/more info for a validation review
 */
router.post('/:id/revision', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { questions, notes } = req.body;
    const reviewerId = (req as any).user?.id;

    const { data, error } = await supabaseAdmin
      .from('validation_reviews')
      .update({
        status: 'REVISION_REQUESTED',
        reviewer_id: reviewerId,
        revision_questions: questions || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Validation review not found or already reviewed' });
      }
      throw error;
    }

    logger.info('Validation revision requested', { reviewId: id, reviewerId });
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error requesting revision', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to request revision' });
  }
});

export default router;
