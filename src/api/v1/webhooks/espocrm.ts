/**
 * EspoCRM Webhook Handlers
 *
 * Receives webhooks from EspoCRM and syncs data back to Banxway.
 *
 * Webhook Events:
 * - Account.afterSave - When account (customer) is updated
 * - Contact.afterSave - When contact is updated
 * - Opportunity.afterSave - When opportunity (quotation) is updated
 *
 * Routes:
 * - POST /api/v1/webhooks/espocrm/account
 * - POST /api/v1/webhooks/espocrm/contact
 * - POST /api/v1/webhooks/espocrm/opportunity
 *
 * Authentication: EspoCRM webhook secret
 */

import express, { Request, Response } from 'express';
import { crmSyncService } from '../../../services/crm-sync.service';
import { logger } from '../../../utils/logger';

const router = express.Router();

// Webhook secret for authentication
const ESPOCRM_WEBHOOK_SECRET = process.env.ESPOCRM_WEBHOOK_SECRET || '';

/**
 * Middleware to verify EspoCRM webhook signature
 */
function verifyEspoCrmWebhook(req: Request, res: Response, next: Function) {
  const signature = req.headers['x-webhook-signature'] as string;
  const secret = req.headers['x-webhook-secret'] as string;

  if (!ESPOCRM_WEBHOOK_SECRET) {
    // If no secret configured, allow all webhooks (development only)
    logger.warn('No EspoCRM webhook secret configured - allowing webhook');
    next();
    return;
  }

  if (secret !== ESPOCRM_WEBHOOK_SECRET) {
    logger.warn('Invalid EspoCRM webhook secret', {
      receivedSecret: secret ? 'present' : 'missing',
    });

    res.status(401).json({
      success: false,
      error: 'Invalid webhook secret',
    });
    return;
  }

  next();
}

/**
 * POST /api/v1/webhooks/espocrm/account
 * Handle EspoCRM Account updates (Customer sync)
 */
router.post('/account', verifyEspoCrmWebhook, async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    logger.info('Received EspoCRM account webhook', {
      accountId: webhookData.id,
      accountName: webhookData.name,
    });

    // Handle account update
    await crmSyncService.handleEspoAccountWebhook(webhookData);

    res.json({
      success: true,
      message: 'Account webhook processed successfully',
    });
  } catch (error: any) {
    logger.error('Failed to process EspoCRM account webhook', {
      error: error.message,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook',
    });
  }
});

/**
 * POST /api/v1/webhooks/espocrm/contact
 * Handle EspoCRM Contact updates
 */
router.post('/contact', verifyEspoCrmWebhook, async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    logger.info('Received EspoCRM contact webhook', {
      contactId: webhookData.id,
      contactName: `${webhookData.firstName} ${webhookData.lastName}`,
    });

    // TODO: Implement contact webhook handler
    // await crmSyncService.handleEspoContactWebhook(webhookData);

    res.json({
      success: true,
      message: 'Contact webhook processed successfully',
    });
  } catch (error: any) {
    logger.error('Failed to process EspoCRM contact webhook', {
      error: error.message,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook',
    });
  }
});

/**
 * POST /api/v1/webhooks/espocrm/opportunity
 * Handle EspoCRM Opportunity updates (Quotation sync)
 */
router.post('/opportunity', verifyEspoCrmWebhook, async (req: Request, res: Response) => {
  try {
    const webhookData = req.body;

    logger.info('Received EspoCRM opportunity webhook', {
      opportunityId: webhookData.id,
      opportunityName: webhookData.name,
      stage: webhookData.stage,
    });

    // TODO: Implement opportunity webhook handler
    // await crmSyncService.handleEspoOpportunityWebhook(webhookData);

    res.json({
      success: true,
      message: 'Opportunity webhook processed successfully',
    });
  } catch (error: any) {
    logger.error('Failed to process EspoCRM opportunity webhook', {
      error: error.message,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook',
    });
  }
});

/**
 * GET /api/v1/webhooks/espocrm/health
 * Health check for EspoCRM webhooks
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'EspoCRM webhook endpoint is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
