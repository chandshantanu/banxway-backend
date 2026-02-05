import { Router } from 'express';
import communicationsRouter from './communications';
import shipmentsRouter from './shipments';
import workflowsRouter from './workflows';
import composeRouter from './compose';
import usersRouter from './users';
import customersRouter from './customers';
import notificationsRouter from './notifications';
import analyticsRouter from './analytics';
import documentsRouter from './documents';
import webhooksRouter from './webhooks';
import settingsRouter from './settings';
import queueRouter from './queue';
import attachmentsRouter from './attachments';
import testWebhooksRouter from './test/webhooks';
import debugRouter from './debug';
import quotationsRouter from './quotations';
import crmRouter from './crm';
import excelImportRouter from './excel-import';
import shippersRouter from './shippers';
import rateCardsRouter from './rate-cards';
import shipperQuoteRequestsRouter from './shipper-quote-requests';
import { conditionalAuth } from '../../middleware/dev-auth.middleware';
import inboxRouter from './inbox';
import threadsRouter from './communications/threads';

const router = Router();

// Mount route handlers
router.use('/threads', conditionalAuth, threadsRouter); // Alias for legacy/frontend compatibility
router.use('/inbox', inboxRouter);
router.use('/communications', communicationsRouter);
router.use('/shipments', shipmentsRouter);
router.use('/workflows', workflowsRouter);
router.use('/compose', composeRouter);
router.use('/users', usersRouter);
router.use('/customers', customersRouter);
router.use('/notifications', notificationsRouter);
router.use('/analytics', analyticsRouter);
router.use('/documents', documentsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/settings', settingsRouter);
router.use('/debug', debugRouter);
router.use('/queue', queueRouter);
router.use('/attachments', attachmentsRouter);
router.use('/quotations', quotationsRouter);
router.use('/crm', crmRouter);
router.use('/excel-import', excelImportRouter);
router.use('/shippers', shippersRouter);
router.use('/rate-cards', rateCardsRouter);
router.use('/shipper-quote-requests', shipperQuoteRequestsRouter);

// Test endpoints (development only)
if (process.env.NODE_ENV !== 'production') {
  router.use('/test/webhooks', testWebhooksRouter);
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
});

// API info endpoint
router.get('/', (req, res) => {
  const endpoints: any = {
    communications: '/api/v1/communications',
    shipments: '/api/v1/shipments',
    workflows: '/api/v1/workflows',
    compose: '/api/v1/compose',
    users: '/api/v1/users',
    customers: '/api/v1/customers',
    notifications: '/api/v1/notifications',
    analytics: '/api/v1/analytics',
    documents: '/api/v1/documents',
    webhooks: '/api/v1/webhooks',
    settings: '/api/v1/settings',
    queue: '/api/v1/queue',
    quotations: '/api/v1/quotations',
    crm: '/api/v1/crm',
    excelImport: '/api/v1/excel-import',
    shippers: '/api/v1/shippers',
    rateCards: '/api/v1/rate-cards',
  };

  if (process.env.NODE_ENV !== 'production') {
    endpoints.testWebhooks = '/api/v1/test/webhooks';
  }

  res.json({
    name: 'Banxway Backend API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints,
  });
});

export default router;
