import { Router, Request, Response } from 'express';
import { integrationsService } from '../../../services/integrations/integrations.service';
import { logger } from '../../../utils/logger';

const router = Router();

// Helper to get organization ID from request
// Uses nil UUID (00000000-0000-0000-0000-000000000000) as fallback for unauthenticated requests
const getOrgId = (req: Request): string => {
  return (req as any).user?.organizationId || (req as any).user?.organization_id || '00000000-0000-0000-0000-000000000000';
};

const getUserId = (req: Request): string | undefined => {
  return (req as any).user?.id;
};

/**
 * GET /api/v1/settings/integrations
 * List all configured integrations for the organization
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrgId(req);
    const integrations = await integrationsService.listIntegrations(organizationId);

    res.json({
      success: true,
      data: integrations,
    });
  } catch (error: any) {
    logger.error('Error listing integrations', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list integrations',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/settings/integrations/:type
 * Get specific integration details (without credentials)
 */
router.get('/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrgId(req);
    const { type } = req.params;

    const integration = await integrationsService.getIntegration(organizationId, type);

    if (!integration) {
      res.status(404).json({
        success: false,
        error: 'Integration not found',
      });
      return;
    }

    res.json({
      success: true,
      data: integration,
    });
  } catch (error: any) {
    logger.error('Error getting integration', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get integration',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/integrations/:type
 * Configure/update integration credentials
 */
router.post('/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrgId(req);
    const userId = getUserId(req);
    const { type } = req.params;
    const credentials = req.body;

    // Validate credentials based on type
    const validationError = validateCredentials(type, credentials);
    if (validationError) {
      res.status(400).json({
        success: false,
        error: validationError,
      });
      return;
    }

    // Test connection before saving
    const testResult = await integrationsService.testIntegration(type, credentials);
    if (!testResult.success) {
      res.status(400).json({
        success: false,
        error: 'Connection test failed',
        message: testResult.error,
      });
      return;
    }

    // Save credentials
    await integrationsService.saveIntegration(organizationId, type, credentials, userId);

    // Mark as verified since test passed
    await integrationsService.markAsVerified(organizationId, type);

    // Log the action
    await integrationsService.logAction(
      organizationId,
      userId || null,
      type,
      'credential_configured',
      'success'
    );

    // For phone integration, sync phone numbers
    if (type === 'exotel_phone') {
      await integrationsService.syncPhoneNumbers(organizationId);
    }

    res.json({
      success: true,
      message: 'Integration configured successfully',
      verified: true,
    });
  } catch (error: any) {
    logger.error('Error configuring integration', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to configure integration',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/integrations/:type/test
 * Test integration connection without saving
 */
router.post('/:type/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;
    const credentials = req.body;

    const result = await integrationsService.testIntegration(type, credentials);

    res.json({
      success: result.success,
      error: result.error,
      message: result.success ? 'Connection test successful' : result.error,
    });
  } catch (error: any) {
    logger.error('Error testing integration', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to test integration',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/settings/integrations/:type
 * Delete integration configuration
 */
router.delete('/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = getOrgId(req);
    const { type } = req.params;

    await integrationsService.deleteIntegration(organizationId, type);

    res.json({
      success: true,
      message: 'Integration deleted successfully',
    });
  } catch (error: any) {
    logger.error('Error deleting integration', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete integration',
      message: error.message,
    });
  }
});

/**
 * Validate credentials based on integration type
 */
function validateCredentials(type: string, credentials: any): string | null {
  switch (type) {
    case 'exotel_phone':
      if (!credentials.account_sid) return 'Missing account_sid';
      if (!credentials.api_key) return 'Missing api_key';
      if (!credentials.api_token) return 'Missing api_token';
      if (!credentials.virtual_number) return 'Missing virtual_number';
      return null;

    case 'exotel_whatsapp':
      if (!credentials.account_sid) return 'Missing account_sid';
      if (!credentials.api_key) return 'Missing api_key';
      if (!credentials.api_token) return 'Missing api_token';
      if (!credentials.whatsapp_number) return 'Missing whatsapp_number';
      return null;

    case 'zoho_mail':
      if (!credentials.email) return 'Missing email';
      if (!credentials.app_password) return 'Missing app_password';
      return null;

    default:
      return 'Unknown integration type';
  }
}

export default router;
