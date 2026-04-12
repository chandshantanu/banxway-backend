/**
 * CRM Sync API Routes
 *
 * Handles EspoCRM synchronization endpoints:
 * - GET /health - Sync health status
 * - GET /stats - Sync statistics
 * - GET /logs - Sync history logs
 * - POST /user - Sync user to EspoCRM
 * - POST /customer - Sync customer to EspoCRM
 * - POST /contact - Sync contact to EspoCRM
 * - POST /quotation - Sync quotation to EspoCRM
 * - POST /bulk-customers - Bulk sync customers
 * - POST /retry/:id - Retry failed sync
 */

import { Router, type Response } from 'express';
import { authenticateRequest, requirePermission, type AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin as supabase } from '../../../config/database.config';
import { logger } from '../../../utils/logger';
import { crmSyncService } from '../../../services/crm-sync.service';

const router = Router();

// All routes require authentication
router.use(authenticateRequest);

/**
 * GET /api/v1/crm/sync/health
 * Get EspoCRM integration health status
 */
router.get('/health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const espocrm_enabled = process.env.ESPOCRM_ENABLED === 'true';
    const espocrm_api_url = process.env.ESPOCRM_API_URL || null;

    // Check if EspoCRM is reachable (simple approach)
    let espocrm_reachable = false;
    if (espocrm_enabled && espocrm_api_url) {
      try {
        const response = await fetch(`${espocrm_api_url}/App/user`, {
          method: 'GET',
          headers: {
            'X-Api-Key': process.env.ESPOCRM_API_KEY || '',
          },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        espocrm_reachable = response.ok;
      } catch (error) {
        logger.warn('EspoCRM health check failed', { error });
        espocrm_reachable = false;
      }
    }

    // Check webhook configuration
    const webhook_configured = !!process.env.ESPOCRM_WEBHOOK_SECRET;

    // Get last successful sync
    const { data: lastSync } = await supabase
      .from('crm_sync_logs')
      .select('created_at')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get pending syncs count
    const { count: pending_syncs } = await supabase
      .from('crm_sync_logs')
      .select('*', { count: 'exact' })
      .eq('status', 'in_progress');

    res.json({
      success: true,
      data: {
        espocrm_enabled,
        espocrm_api_url,
        espocrm_reachable,
        webhook_configured,
        last_successful_sync: lastSync?.created_at || null,
        pending_syncs: pending_syncs || 0,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get sync health status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get sync health status',
    });
  }
});

/**
 * GET /api/v1/crm/sync/stats
 * Get sync statistics
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get overall stats — limit to recent 10000 rows to avoid full table scan OOM
    const { data: logs } = await supabase
      .from('crm_sync_logs')
      .select('status, entity_type, created_at')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (!logs) {
      res.json({
        success: true,
        data: {
          total_syncs: 0,
          successful_syncs: 0,
          failed_syncs: 0,
          in_progress_syncs: 0,
          last_sync_at: null,
          sync_by_entity: {
            USER: { total: 0, successful: 0, failed: 0 },
            CUSTOMER: { total: 0, successful: 0, failed: 0 },
            CONTACT: { total: 0, successful: 0, failed: 0 },
            QUOTATION: { total: 0, successful: 0, failed: 0 },
          },
        },
      });
      return;
    }

    const total_syncs = logs.length;
    const successful_syncs = logs.filter((l: any) => l.status === 'success').length;
    const failed_syncs = logs.filter((l: any) => l.status === 'failed').length;
    const in_progress_syncs = logs.filter((l: any) => l.status === 'in_progress').length;
    const last_sync_at = logs.length > 0 ? logs[0].created_at : null;

    // Calculate stats by entity type
    const sync_by_entity = {
      USER: {
        total: logs.filter((l: any) => l.entity_type === 'USER').length,
        successful: logs.filter((l: any) => l.entity_type === 'USER' && l.status === 'success').length,
        failed: logs.filter((l: any) => l.entity_type === 'USER' && l.status === 'failed').length,
      },
      CUSTOMER: {
        total: logs.filter((l: any) => l.entity_type === 'CUSTOMER').length,
        successful: logs.filter((l: any) => l.entity_type === 'CUSTOMER' && l.status === 'success')
          .length,
        failed: logs.filter((l: any) => l.entity_type === 'CUSTOMER' && l.status === 'failed').length,
      },
      CONTACT: {
        total: logs.filter((l: any) => l.entity_type === 'CONTACT').length,
        successful: logs.filter((l: any) => l.entity_type === 'CONTACT' && l.status === 'success')
          .length,
        failed: logs.filter((l: any) => l.entity_type === 'CONTACT' && l.status === 'failed').length,
      },
      QUOTATION: {
        total: logs.filter((l: any) => l.entity_type === 'QUOTATION').length,
        successful: logs.filter((l: any) => l.entity_type === 'QUOTATION' && l.status === 'success')
          .length,
        failed: logs.filter((l: any) => l.entity_type === 'QUOTATION' && l.status === 'failed').length,
      },
    };

    res.json({
      success: true,
      data: {
        total_syncs,
        successful_syncs,
        failed_syncs,
        in_progress_syncs,
        last_sync_at,
        sync_by_entity,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get sync stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get sync stats',
    });
  }
});

/**
 * GET /api/v1/crm/sync/logs
 * Get sync logs with filters
 */
router.get('/logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entity_type, status, direction, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('crm_sync_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (entity_type) {
      query = query.eq('entity_type', entity_type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (direction) {
      query = query.eq('direction', direction);
    }

    const { data: logs, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: logs || [],
      count: count || 0,
    });
  } catch (error: any) {
    logger.error('Failed to get sync logs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get sync logs',
    });
  }
});

/**
 * POST /api/v1/crm/sync/user
 * Trigger user sync to EspoCRM
 * CRITICAL: Users must be synced to EspoCRM for authentication and data ownership
 */
router.post('/user', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      res.status(400).json({
        success: false,
        error: 'user_id is required',
      });
      return;
    }

    if (process.env.ESPOCRM_ENABLED !== 'true') {
      res.status(400).json({
        success: false,
        error: 'EspoCRM integration is not enabled',
      });
      return;
    }

    await crmSyncService.syncUserToEspo(user_id);

    res.json({
      success: true,
      message: 'User sync triggered successfully',
      data: {
        sync_log_id: user_id,
      },
    });
  } catch (error: any) {
    logger.error('Failed to sync user', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync user',
    });
  }
});

/**
 * POST /api/v1/crm/sync/customer
 * Trigger customer sync to EspoCRM
 */
router.post('/customer', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customer_id } = req.body;

    if (!customer_id) {
      res.status(400).json({
        success: false,
        error: 'customer_id is required',
      });
      return;
    }

    // Check if EspoCRM is enabled
    if (process.env.ESPOCRM_ENABLED !== 'true') {
      res.status(400).json({
        success: false,
        error: 'EspoCRM integration is not enabled',
      });
      return;
    }

    await crmSyncService.syncCustomerToEspo(customer_id);

    res.json({
      success: true,
      message: 'Customer sync triggered successfully',
      data: {
        sync_log_id: customer_id, // Simplified for now
      },
    });
  } catch (error: any) {
    logger.error('Failed to sync customer', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync customer',
    });
  }
});

/**
 * POST /api/v1/crm/sync/contact
 * Trigger contact sync to EspoCRM
 */
router.post('/contact', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { contact_id } = req.body;

    if (!contact_id) {
      res.status(400).json({
        success: false,
        error: 'contact_id is required',
      });
      return;
    }

    if (process.env.ESPOCRM_ENABLED !== 'true') {
      res.status(400).json({
        success: false,
        error: 'EspoCRM integration is not enabled',
      });
      return;
    }

    await crmSyncService.syncContactToEspo(contact_id);

    res.json({
      success: true,
      message: 'Contact sync triggered successfully',
      data: {
        sync_log_id: contact_id,
      },
    });
  } catch (error: any) {
    logger.error('Failed to sync contact', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync contact',
    });
  }
});

/**
 * POST /api/v1/crm/sync/quotation
 * Trigger quotation sync to EspoCRM
 */
router.post('/quotation', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { quotation_id } = req.body;

    if (!quotation_id) {
      res.status(400).json({
        success: false,
        error: 'quotation_id is required',
      });
      return;
    }

    if (process.env.ESPOCRM_ENABLED !== 'true') {
      res.status(400).json({
        success: false,
        error: 'EspoCRM integration is not enabled',
      });
      return;
    }

    await crmSyncService.syncQuotationToEspo(quotation_id);

    res.json({
      success: true,
      message: 'Quotation sync triggered successfully',
      data: {
        sync_log_id: quotation_id,
      },
    });
  } catch (error: any) {
    logger.error('Failed to sync quotation', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync quotation',
    });
  }
});

/**
 * POST /api/v1/crm/sync/bulk-customers
 * Bulk sync customers to EspoCRM
 */
router.post('/bulk-customers', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customer_ids } = req.body;

    if (!customer_ids || !Array.isArray(customer_ids)) {
      res.status(400).json({
        success: false,
        error: 'customer_ids array is required',
      });
      return;
    }

    if (process.env.ESPOCRM_ENABLED !== 'true') {
      res.status(400).json({
        success: false,
        error: 'EspoCRM integration is not enabled',
      });
      return;
    }

    let successful = 0;
    let failed = 0;

    for (const customer_id of customer_ids) {
      try {
        await crmSyncService.syncCustomerToEspo(customer_id);
        successful++;
      } catch (error) {
        logger.error('Bulk sync failed for customer', { customer_id, error });
        failed++;
      }
    }

    res.json({
      success: true,
      data: {
        total: customer_ids.length,
        successful,
        failed,
      },
    });
  } catch (error: any) {
    logger.error('Failed to bulk sync customers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to bulk sync customers',
    });
  }
});

/**
 * POST /api/v1/crm/sync/retry/:id
 * Retry failed sync
 */
router.post('/retry/:id', requirePermission(Permission.MANAGE_INTEGRATIONS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (process.env.ESPOCRM_ENABLED !== 'true') {
      res.status(400).json({
        success: false,
        error: 'EspoCRM integration is not enabled',
      });
      return;
    }

    // Get the failed sync log
    const { data: syncLog, error } = await supabase
      .from('crm_sync_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !syncLog) {
      res.status(404).json({
        success: false,
        error: 'Sync log not found',
      });
      return;
    }

    // Retry based on entity type
    switch (syncLog.entity_type) {
      case 'USER':
        await crmSyncService.syncUserToEspo(syncLog.banxway_id);
        break;
      case 'CUSTOMER':
        await crmSyncService.syncCustomerToEspo(syncLog.banxway_id);
        break;
      case 'CONTACT':
        await crmSyncService.syncContactToEspo(syncLog.banxway_id);
        break;
      case 'QUOTATION':
        await crmSyncService.syncQuotationToEspo(syncLog.banxway_id);
        break;
      default:
        throw new Error('Unknown entity type');
    }

    res.json({
      success: true,
      message: 'Sync retry triggered successfully',
      data: {
        sync_log_id: id,
      },
    });
  } catch (error: any) {
    logger.error('Failed to retry sync', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retry sync',
    });
  }
});

export default router;
