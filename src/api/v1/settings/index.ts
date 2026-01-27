import { Router } from 'express';
import emailAccountsRouter from './email-accounts';
import integrationsRouter from './integrations';
import phoneNumbersRouter from './phone-numbers';
import emailAccountService from '../../../services/email/email-account.service';
import { integrationsService } from '../../../services/integrations/integrations.service';
import { logger } from '../../../utils/logger';

const router = Router();

// Email accounts management
router.use('/email-accounts', emailAccountsRouter);

// Integrations management (Exotel, Zoho, etc.)
router.use('/integrations', integrationsRouter);

// Phone numbers management
router.use('/phone-numbers', phoneNumbersRouter);

// Configuration status endpoint - check what's configured
router.get('/configuration-status', async (req, res) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).user?.organization_id;

    // Get active email accounts
    const accounts = await emailAccountService.getAllAccounts(false);
    const activeAccounts = accounts.filter(a => a.is_active);

    // Get integrations (only if authenticated with valid orgId)
    let phoneIntegration = null;
    let whatsappIntegration = null;
    let smsIntegration = null;

    if (orgId) {
      try {
        const integrations = await integrationsService.listIntegrations(orgId);
        phoneIntegration = integrations.find(i => i.integration_type === 'exotel_phone' && i.is_verified);
        whatsappIntegration = integrations.find(i => i.integration_type === 'exotel_whatsapp' && i.is_verified);
        smsIntegration = integrations.find(i => i.integration_type === 'exotel_sms' && i.is_verified);
      } catch (integrationError: any) {
        // Log but don't fail the entire endpoint
        logger.debug('Could not fetch integrations', { error: integrationError.message });
      }
    }

    res.json({
      success: true,
      data: {
        emailConfigured: activeAccounts.length > 0,
        totalEmailAccounts: accounts.length,
        activeEmailAccounts: activeAccounts.length,
        hasDefaultAccount: accounts.some(a => a.is_default),
        whatsappConfigured: !!whatsappIntegration,
        smsConfigured: !!smsIntegration,
        voiceConfigured: !!phoneIntegration,
      },
    });
  } catch (error: any) {
    logger.error('Error checking configuration status', { error: error.message });
    // Return unconfigured status on error rather than failing
    res.json({
      success: true,
      data: {
        emailConfigured: false,
        totalEmailAccounts: 0,
        activeEmailAccounts: 0,
        hasDefaultAccount: false,
        whatsappConfigured: false,
        smsConfigured: false,
        voiceConfigured: false,
      },
    });
  }
});

// Settings overview endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      endpoints: {
        emailAccounts: '/api/v1/settings/email-accounts',
        integrations: '/api/v1/settings/integrations',
        phoneNumbers: '/api/v1/settings/phone-numbers',
        configurationStatus: '/api/v1/settings/configuration-status',
      },
    },
  });
});

export default router;
