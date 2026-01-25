import { Router, Request, Response } from 'express';
import { integrationsService } from '../../../services/integrations/integrations.service';
import { logger } from '../../../utils/logger';

const router = Router();

// Helper to get organization ID from request
const getOrgId = (req: Request): string => {
  return (req as any).user?.organizationId || (req as any).user?.organization_id || 'default-org';
};

/**
 * GET /api/v1/settings/phone-numbers
 * List all phone numbers for the organization
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrgId(req);

    // Sync phone numbers from Exotel integration
    const phoneNumbers = await integrationsService.syncPhoneNumbers(organizationId);

    res.json({
      success: true,
      data: phoneNumbers,
    });
  } catch (error: any) {
    logger.error('Error listing phone numbers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list phone numbers',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/phone-numbers/:id/assign
 * Assign phone number to a user
 */
router.post('/:id/assign', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrgId(req);
    const { id } = req.params;
    const { user_id } = req.body;

    await integrationsService.assignPhoneNumber(organizationId, id, user_id || null);

    res.json({
      success: true,
      message: user_id ? 'Phone number assigned successfully' : 'Phone number unassigned successfully',
    });
  } catch (error: any) {
    logger.error('Error assigning phone number', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to assign phone number',
      message: error.message,
    });
  }
});

export default router;
