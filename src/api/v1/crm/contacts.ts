import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import crmService, { CrmError } from '../../../services/crm.service';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

// ============================================================================
// GET /api/v1/crm/contacts - Get all contacts across all customers
// ============================================================================
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const contacts = await crmService.getAllContacts();

    res.json({
      success: true,
      data: contacts,
      count: contacts.length,
    });
  } catch (error: any) {
    if (error instanceof CrmError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error in GET /crm/contacts', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts',
    });
  }
});

export default router;
