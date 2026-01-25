import { Router, Request, Response } from 'express';
import emailAccountService from '../../../services/email/email-account.service';
import { CreateEmailAccountRequest, UpdateEmailAccountRequest } from '../../../database/repositories/email-account.repository';
import { logger } from '../../../utils/logger';

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
 * Create a new email account
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const accountData: CreateEmailAccountRequest = req.body;

    // Validate required fields
    if (!accountData.name || !accountData.email || !accountData.smtp_user || !accountData.smtp_password || !accountData.imap_user || !accountData.imap_password) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['name', 'email', 'smtp_user', 'smtp_password', 'imap_user', 'imap_password'],
      });
      return;
    }

    // Get user ID from request (set by auth middleware)
    const userId = (req as any).user?.id;

    const account = await emailAccountService.createAccount(accountData, userId);

    // Strip encrypted passwords
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
    logger.error('Error creating email account', { error: error.message });

    if (error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: 'Email account already exists',
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create email account',
      message: error.message,
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

export default router;
