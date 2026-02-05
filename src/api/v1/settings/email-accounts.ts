import { Router, Request, Response } from 'express';
import emailAccountService from '../../../services/email/email-account.service';
import { CreateEmailAccountRequest, UpdateEmailAccountRequest } from '../../../database/repositories/email-account.repository';
import { logger } from '../../../utils/logger';
import { EmailProviderRegistry } from '../../../services/email/email-provider.registry';
import { MXLookupService } from '../../../services/email/mx-lookup.service';
import { getEmailQueue } from '../../../config/redis.config';

const router = Router();

/**
 * GET /api/v1/settings/email-accounts
 * List all email accounts
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const accounts = await emailAccountService.getAllAccounts(includeInactive);

    // Strip encrypted passwords from response
    const safeAccounts = accounts.map(account => ({
      ...account,
      smtp_pass_encrypted: undefined,
      imap_pass_encrypted: undefined,
    }));

    res.json({
      success: true,
      data: safeAccounts,
      count: safeAccounts.length,
    });
  } catch (error: any) {
    logger.error('Error listing email accounts', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list email accounts',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/settings/email-accounts/providers
 * List available email providers
 */
router.get('/providers', async (req: Request, res: Response): Promise<void> => {
  try {
    const providers = EmailProviderRegistry.getAllProviders();

    res.json({
      success: true,
      data: providers.map((p) => ({
        id: p.id,
        name: p.name,
        helpUrl: p.helpUrl,
        smtp: p.smtp,
        imap: p.imap,
      })),
      count: providers.length,
    });
  } catch (error: any) {
    logger.error('Failed to fetch providers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email providers',
    });
  }
});

/**
 * POST /api/v1/settings/email-accounts/detect-provider
 * Detect provider from email address
 */
router.post('/detect-provider', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email address is required',
      });
      return;
    }

    // Try domain detection first
    let provider = EmailProviderRegistry.detectFromEmail(email);
    let confidence: 'high' | 'medium' | 'low' = 'high';

    if (!provider) {
      // Try MX lookup
      const mxResult = await MXLookupService.detectProvider(email);
      provider = mxResult.config;
      confidence = mxResult.confidence;
    }

    if (provider) {
      res.json({
        success: true,
        data: {
          provider: provider.id,
          name: provider.name,
          confidence,
          config: {
            smtp: provider.smtp,
            imap: provider.imap,
          },
        },
      });
    } else {
      res.json({
        success: false,
        message: 'Could not detect email provider',
        data: null,
      });
    }
  } catch (error: any) {
    logger.error('Failed to detect provider', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to detect email provider',
    });
  }
});

/**
 * GET /api/v1/settings/email-accounts/:id
 * Get a specific email account
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await emailAccountService.getAccount(req.params.id);

    if (!account) {
      res.status(404).json({
        success: false,
        error: 'Email account not found',
      });
      return;
    }

    // Strip encrypted passwords
    const safeAccount = {
      ...account,
      smtp_pass_encrypted: undefined,
      imap_pass_encrypted: undefined,
    };

    res.json({
      success: true,
      data: safeAccount,
    });
  } catch (error: any) {
    logger.error('Error getting email account', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get email account',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/email-accounts
 * Create a new email account (supports both provider-based and manual configuration)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    // Check if request uses simplified provider format
    const hasProvider = req.body.provider !== undefined;
    const hasMinimalFields = req.body.email && req.body.smtp_password && req.body.imap_password;
    const hasAllSMTPFields = req.body.smtp_host && req.body.smtp_port !== undefined;

    let account;

    if (hasProvider || (hasMinimalFields && !hasAllSMTPFields)) {
      // Use new provider-based creation
      logger.info('Creating email account with provider', {
        email: req.body.email,
        provider: req.body.provider || 'auto-detect',
      });

      // Validate minimal required fields
      if (!req.body.name || !req.body.email || !req.body.smtp_password || !req.body.imap_password) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          required: ['name', 'email', 'smtp_password', 'imap_password'],
        });
        return;
      }

      account = await emailAccountService.createAccountWithProvider(req.body, userId);
    } else {
      // Use legacy creation (all fields provided)
      logger.info('Creating email account with manual configuration', {
        email: req.body.email,
      });

      // Validate all required fields for manual configuration
      const accountData: CreateEmailAccountRequest = req.body;
      if (
        !accountData.name ||
        !accountData.email ||
        !accountData.smtp_user ||
        !accountData.smtp_password ||
        !accountData.imap_user ||
        !accountData.imap_password
      ) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          required: ['name', 'email', 'smtp_user', 'smtp_password', 'imap_user', 'imap_password'],
        });
        return;
      }

      account = await emailAccountService.createAccount(accountData, userId);
    }

    // Strip encrypted passwords from response
    const safeAccount = {
      ...account,
      smtp_pass_encrypted: undefined,
      imap_pass_encrypted: undefined,
    };

    res.status(201).json({
      success: true,
      data: safeAccount,
      message: 'Email account created successfully',
    });
  } catch (error: any) {
    logger.error('Failed to create email account', { error: error.message });

    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: 'Email account already exists',
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/v1/settings/email-accounts/:id
 * Update an email account
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const updates: UpdateEmailAccountRequest = req.body;
    const account = await emailAccountService.updateAccount(req.params.id, updates);

    // Strip encrypted passwords
    const safeAccount = {
      ...account,
      smtp_pass_encrypted: undefined,
      imap_pass_encrypted: undefined,
    };

    res.json({
      success: true,
      data: safeAccount,
      message: 'Email account updated successfully',
    });
  } catch (error: any) {
    logger.error('Error updating email account', { id: req.params.id, error: error.message });

    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Email account not found',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update email account',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/v1/settings/email-accounts/:id
 * Delete an email account
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await emailAccountService.deleteAccount(req.params.id);

    res.json({
      success: true,
      message: 'Email account deleted successfully',
    });
  } catch (error: any) {
    logger.error('Error deleting email account', { id: req.params.id, error: error.message });

    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Email account not found',
      });
      return;
    }

    if (error.message.includes('Cannot delete')) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete default account',
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete email account',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/email-accounts/:id/test
 * Test SMTP and IMAP connections
 */
router.post('/:id/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const testType = req.query.type as string; // 'smtp', 'imap', or 'all' (default)

    let result;
    if (testType === 'smtp') {
      result = { smtp: await emailAccountService.testSmtpConnection(req.params.id) };
    } else if (testType === 'imap') {
      result = { imap: await emailAccountService.testImapConnection(req.params.id) };
    } else {
      result = await emailAccountService.testAllConnections(req.params.id);
    }

    const allSuccessful = Object.values(result).every((r: any) => r.success);

    res.json({
      success: allSuccessful,
      data: result,
      message: allSuccessful
        ? 'Connection test successful'
        : 'One or more connection tests failed',
    });
  } catch (error: any) {
    logger.error('Error testing email account connections', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to test connections',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/email-accounts/:id/set-default
 * Set an account as the default
 */
router.post('/:id/set-default', async (req: Request, res: Response): Promise<void> => {
  try {
    const account = await emailAccountService.setAsDefault(req.params.id);

    res.json({
      success: true,
      data: {
        ...account,
        smtp_pass_encrypted: undefined,
        imap_pass_encrypted: undefined,
      },
      message: 'Account set as default successfully',
    });
  } catch (error: any) {
    logger.error('Error setting default account', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to set default account',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/email-accounts/:id/toggle-polling
 * Enable/disable IMAP polling for an account
 */
router.post('/:id/toggle-polling', async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: enabled (boolean)',
      });
      return;
    }

    const account = await emailAccountService.setPollingEnabled(req.params.id, enabled);

    res.json({
      success: true,
      data: {
        ...account,
        smtp_pass_encrypted: undefined,
        imap_pass_encrypted: undefined,
      },
      message: `Polling ${enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error: any) {
    logger.error('Error toggling polling', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to toggle polling',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/settings/email-accounts/poll-now
 * Manually trigger email polling for all accounts (or specific account)
 *
 * Query params:
 * - accountId: (optional) Poll specific account only
 */
router.post('/poll-now', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountId = req.query.accountId as string | undefined;
    const emailQueue = getEmailQueue();

    if (accountId) {
      // Poll specific account
      await emailQueue.add('POLL_INBOX', {
        action: 'POLL_INBOX',
        data: { accountId },
      });

      logger.info('Manual email poll triggered for account', { accountId });

      res.json({
        success: true,
        message: 'Email polling started for specified account',
        data: { accountId },
      });
    } else {
      // Poll all accounts
      await emailQueue.add('POLL_ALL_INBOXES', {
        action: 'POLL_ALL_INBOXES',
      });

      logger.info('Manual email poll triggered for all accounts');

      res.json({
        success: true,
        message: 'Email polling started for all accounts',
      });
    }
  } catch (error: any) {
    logger.error('Error triggering manual email poll', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to trigger email polling',
      message: error.message,
    });
  }
});

export default router;
