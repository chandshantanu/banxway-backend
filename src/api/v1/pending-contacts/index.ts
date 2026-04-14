import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import pendingContactRepository from '../../../database/repositories/pending-contact.repository';
import identityResolutionService from '../../../services/identity-resolution.service';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

/**
 * GET /api/v1/pending-contacts
 * List pending contacts (approval queue)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, domain, page, limit } = req.query;
    const result = await pendingContactRepository.findAll(
      {
        status: (status as string) || 'PENDING',
        domain: domain as string | undefined,
      },
      {
        page: parseInt(page as string || '1', 10),
        limit: parseInt(limit as string || '20', 10),
      }
    );
    res.json({
      success: true,
      data: result.data,
      total: result.total,
      page: parseInt(page as string || '1', 10),
    });
  } catch (error: any) {
    logger.error('Error fetching pending contacts', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch pending contacts' });
  }
});

/**
 * GET /api/v1/pending-contacts/count
 * Get count of pending contacts
 */
router.get('/count', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const count = await pendingContactRepository.getPendingCount();
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get count' });
  }
});

/**
 * GET /api/v1/pending-contacts/:id
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const contact = await pendingContactRepository.findById(req.params.id);
    if (!contact) {
      res.status(404).json({ success: false, error: 'Pending contact not found' });
      return;
    }
    res.json({ success: true, data: contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pending-contacts/:id/approve
 * Approve a pending contact — creates CRM entry + links threads
 */
router.post('/:id/approve', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { entity_type, legal_name, primary_phone, industry, lead_source, notes } = req.body;

    if (!entity_type) {
      res.status(400).json({ success: false, error: 'entity_type is required (CUSTOMER, AGENCY, SUPPLIER, etc.)' });
      return;
    }

    const result = await identityResolutionService.approvePendingContact(
      req.params.id,
      req.user!.id,
      entity_type,
      { legal_name, primary_phone, industry, lead_source, notes }
    );

    res.json({
      success: true,
      data: result,
      message: `Contact approved. CRM entry created, ${result.linkedThreads} threads linked.`,
    });
  } catch (error: any) {
    logger.error('Error approving pending contact', { id: req.params.id, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pending-contacts/:id/reject
 */
router.post('/:id/reject', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    const contact = await pendingContactRepository.reject(req.params.id, req.user!.id, reason || 'Rejected');
    res.json({ success: true, data: contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pending-contacts/:id/spam
 */
router.post('/:id/spam', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await pendingContactRepository.markSpam(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Marked as spam' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/pending-contacts/bulk-approve
 * Bulk approve multiple pending contacts
 */
router.post('/bulk-approve', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { contacts } = req.body; // Array of { id, entity_type, legal_name? }

    if (!contacts || !Array.isArray(contacts)) {
      res.status(400).json({ success: false, error: 'contacts array required' });
      return;
    }

    const results = [];
    for (const c of contacts) {
      try {
        const result = await identityResolutionService.approvePendingContact(
          c.id,
          req.user!.id,
          c.entity_type || 'CUSTOMER',
          { legal_name: c.legal_name }
        );
        results.push({ id: c.id, success: true, ...result });
      } catch (err: any) {
        results.push({ id: c.id, success: false, error: err.message });
      }
    }

    const approved = results.filter(r => r.success).length;
    res.json({
      success: true,
      data: results,
      message: `${approved}/${contacts.length} contacts approved`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
