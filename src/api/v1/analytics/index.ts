import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';
import analyticsService from '../../../services/analytics.service';

const router = Router();
router.use(authenticateRequest);

// Helper: run a query but return empty/zero on error (graceful degradation for missing tables)
async function safeQuery<T>(query: any): Promise<{ data: T | null; count: number }> {
  try {
    const result = await query;
    if (result.error) {
      logger.debug('Analytics query failed (non-fatal)', { error: result.error.message });
      return { data: null, count: 0 };
    }
    return { data: result.data, count: result.count ?? 0 };
  } catch {
    return { data: null, count: 0 };
  }
}

// Get dashboard stats - main stats for the dashboard
router.get('/dashboard', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Run all queries in parallel — each wrapped in safeQuery so a missing table
    // doesn't 500 the entire dashboard
    const [
      shipmentsResult,
      threadsResult,
      messageCountResult,
      customerCountResult,
      usersResult,
      recentThreadsResult,
      quotationsResult,
      crmLeadsResult,
    ] = await Promise.all([
      safeQuery(supabaseAdmin.from('shipments').select('id, status')),
      safeQuery(supabaseAdmin.from('communication_threads').select('id, status, priority, primary_channel, sla_status, lead_classification, crm_customer_id, created_at')),
      safeQuery(supabaseAdmin.from('communication_messages').select('*', { count: 'exact' })),
      safeQuery(supabaseAdmin.from('crm_customers').select('*', { count: 'exact' })),
      safeQuery(supabaseAdmin.from('users').select('id, role, is_active')),
      safeQuery(supabaseAdmin.from('communication_threads').select('created_at').gte('created_at', sevenDaysAgo.toISOString())),
      safeQuery(supabaseAdmin.from('quotations').select('id, status', { count: 'exact' })),
      safeQuery(supabaseAdmin.from('crm_customers').select('id').eq('status', 'LEAD')),
    ]);

    const shipments = (shipmentsResult.data as any[]) || [];
    const threads = (threadsResult.data as any[]) || [];
    const users = (usersResult.data as any[]) || [];
    const recentThreads = (recentThreadsResult.data as any[]) || [];
    const quotations = (quotationsResult.data as any[]) || [];

    const shipmentStats = {
      total: shipments.length,
      inTransit: shipments.filter(s => s.status === 'IN_TRANSIT').length,
      pending: shipments.filter(s => ['DRAFT', 'PENDING', 'BOOKED'].includes(s.status)).length,
      delivered: shipments.filter(s => s.status === 'DELIVERED').length,
      exceptions: shipments.filter(s => s.status === 'EXCEPTION').length,
    };

    const threadStats = {
      total: threads.length,
      open: threads.filter(t => ['NEW', 'IN_PROGRESS', 'AWAITING_CLIENT', 'AWAITING_INTERNAL'].includes(t.status)).length,
      resolved: threads.filter(t => t.status === 'RESOLVED').length,
      closed: threads.filter(t => t.status === 'CLOSED').length,
      highPriority: threads.filter(t => ['HIGH', 'URGENT', 'CRITICAL'].includes(t.priority)).length,
      slaBreach: threads.filter(t => t.sla_status === 'BREACHED').length,
      // New: lead classification breakdown
      newLeads: threads.filter(t => t.lead_classification === 'new_lead').length,
      existingCustomers: threads.filter(t => t.lead_classification === 'existing_customer').length,
      existingShipments: threads.filter(t => t.lead_classification === 'existing_shipment').length,
      linkedToCrm: threads.filter(t => t.crm_customer_id).length,
    };

    const channelBreakdown = {
      email: threads.filter(t => t.primary_channel === 'EMAIL').length,
      whatsapp: threads.filter(t => t.primary_channel === 'WHATSAPP').length,
      sms: threads.filter(t => t.primary_channel === 'SMS').length,
      voice: threads.filter(t => t.primary_channel === 'VOICE').length,
      portal: threads.filter(t => t.primary_channel === 'PORTAL').length,
    };

    const userStats = {
      total: users.length,
      active: users.filter(u => u.is_active).length,
      byRole: {
        admin: users.filter(u => u.role === 'admin').length,
        manager: users.filter(u => u.role === 'manager').length,
        validator: users.filter(u => u.role === 'validator').length,
        support: users.filter(u => u.role === 'support').length,
        viewer: users.filter(u => u.role === 'viewer').length,
      }
    };

    // Group by day
    const dailyTrend = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toISOString().split('T')[0];
      const count = recentThreads.filter(t => {
        const ts = t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at || '');
        return ts.startsWith(dateStr);
      }).length;
      return { date: dateStr, count };
    });

    res.json({
      success: true,
      data: {
        shipments: shipmentStats,
        threads: threadStats,
        channels: channelBreakdown,
        messages: { total: messageCountResult.count || 0 },
        customers: { total: customerCountResult.count || 0 },
        leads: { total: (crmLeadsResult.data as any[])?.length || 0 },
        quotations: {
          total: quotations.length,
          draft: quotations.filter(q => q.status === 'DRAFT').length,
          sent: quotations.filter(q => q.status === 'SENT').length,
          accepted: quotations.filter(q => q.status === 'ACCEPTED').length,
        },
        users: userStats,
        trend: dailyTrend,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching dashboard analytics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard analytics' });
  }
});

// Get team performance stats
router.get('/team-performance', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get users with their thread assignments
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, role, is_active');

    // Get threads with assignments
    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('id, assigned_to, status, resolved_at, created_at');

    // Calculate stats per user
    const teamStats = users?.filter((u: any) => u.is_active).map((user: any) => {
      const userThreads = threads?.filter((t: any) => t.assigned_to === user.id) || [];
      const resolved = userThreads.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED');

      return {
        id: user.id,
        name: user.full_name || user.email,
        role: user.role,
        stats: {
          assigned: userThreads.length,
          resolved: resolved.length,
          open: userThreads.length - resolved.length,
          resolutionRate: userThreads.length > 0 ? Math.round((resolved.length / userThreads.length) * 100) : 0,
        }
      };
    }) || [];

    res.json({
      success: true,
      data: teamStats,
    });
  } catch (error: any) {
    logger.error('Error fetching team performance', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch team performance' });
  }
});

// Get SLA metrics
router.get('/sla', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('id, sla_status, sla_deadline, priority, created_at, resolved_at');

    const slaStats = {
      total: threads?.length || 0,
      withinSla: threads?.filter((t: any) => t.sla_status === 'ON_TRACK' || t.sla_status === 'MET').length || 0,
      atRisk: threads?.filter((t: any) => t.sla_status === 'AT_RISK').length || 0,
      breached: threads?.filter((t: any) => t.sla_status === 'BREACHED').length || 0,
      complianceRate: 0,
    };

    if (slaStats.total > 0) {
      slaStats.complianceRate = Math.round((slaStats.withinSla / slaStats.total) * 100);
    }

    // SLA by priority
    const byPriority = {
      critical: threads?.filter((t: any) => t.priority === 'CRITICAL').length || 0,
      urgent: threads?.filter((t: any) => t.priority === 'URGENT').length || 0,
      high: threads?.filter((t: any) => t.priority === 'HIGH').length || 0,
      medium: threads?.filter((t: any) => t.priority === 'MEDIUM').length || 0,
      low: threads?.filter((t: any) => t.priority === 'LOW').length || 0,
    };

    res.json({
      success: true,
      data: {
        ...slaStats,
        byPriority,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching SLA metrics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch SLA metrics' });
  }
});

// Get communications stats with recent activity per channel
router.get('/communications-stats', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get recent messages per channel with sender info
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 24); // Get last 24 hours

    // Run all queries in parallel
    const [
      emailMessagesResult,
      whatsappMessagesResult,
      phoneMessagesResult,
      emailTotalResult,
      emailUnreadResult,
      whatsappTotalResult,
      whatsappUnreadResult,
      phoneTotalResult,
      phoneUnreadResult,
      urgentThreadsResult,
    ] = await Promise.all([
      supabaseAdmin.from('communication_messages').select('id, from_address, subject, created_at, read_at, thread_id').eq('channel', 'EMAIL').eq('direction', 'INBOUND').order('created_at', { ascending: false }).limit(10),
      supabaseAdmin.from('communication_messages').select('id, from_address, subject, created_at, read_at, thread_id').eq('channel', 'WHATSAPP').eq('direction', 'INBOUND').order('created_at', { ascending: false }).limit(10),
      supabaseAdmin.from('communication_messages').select('id, from_address, subject, created_at, read_at, thread_id').eq('channel', 'VOICE').eq('direction', 'INBOUND').order('created_at', { ascending: false }).limit(10),
      supabaseAdmin.from('communication_messages').select('*', { count: 'exact' }).eq('channel', 'EMAIL'),
      supabaseAdmin.from('communication_messages').select('*', { count: 'exact' }).eq('channel', 'EMAIL').is('read_at', null),
      supabaseAdmin.from('communication_messages').select('*', { count: 'exact' }).eq('channel', 'WHATSAPP'),
      supabaseAdmin.from('communication_messages').select('*', { count: 'exact' }).eq('channel', 'WHATSAPP').is('read_at', null),
      supabaseAdmin.from('communication_messages').select('*', { count: 'exact' }).eq('channel', 'VOICE'),
      supabaseAdmin.from('communication_messages').select('*', { count: 'exact' }).eq('channel', 'VOICE').is('read_at', null),
      supabaseAdmin.from('communication_threads').select('id, primary_channel').in('priority', ['HIGH', 'URGENT', 'CRITICAL']).not('status', 'in', '("RESOLVED","CLOSED")'),
    ]);

    const emailMessages = emailMessagesResult.data;
    const whatsappMessages = whatsappMessagesResult.data;
    const phoneMessages = phoneMessagesResult.data;
    const emailTotal = emailTotalResult.count;
    const emailUnread = emailUnreadResult.count;
    const whatsappTotal = whatsappTotalResult.count;
    const whatsappUnread = whatsappUnreadResult.count;
    const phoneTotal = phoneTotalResult.count;
    const phoneUnread = phoneUnreadResult.count;
    const urgentThreads = urgentThreadsResult.data;

    const urgentByChannel = {
      email: urgentThreads?.filter((t: any) => t.primary_channel === 'EMAIL').length || 0,
      whatsapp: urgentThreads?.filter((t: any) => t.primary_channel === 'WHATSAPP').length || 0,
      phone: urgentThreads?.filter((t: any) => t.primary_channel === 'VOICE').length || 0,
    };

    // Format recent activity
    const formatActivity = (messages: any[] | null) => {
      if (!messages) return [];
      return messages.map(m => ({
        id: m.id,
        from: m.from_address || 'Unknown',
        subject: m.subject || undefined,
        timestamp: new Date(m.created_at),
        isUnread: !m.read_at,
      }));
    };

    res.json({
      success: true,
      data: {
        email: {
          total: emailTotal || 0,
          unread: emailUnread || 0,
          urgent: urgentByChannel.email,
          avgResponseTime: null,
          trend: emailTotal ? Math.round((emailUnread || 0) / emailTotal * 100) : 0,
          recentActivity: formatActivity(emailMessages),
        },
        whatsapp: {
          total: whatsappTotal || 0,
          unread: whatsappUnread || 0,
          urgent: urgentByChannel.whatsapp,
          avgResponseTime: null,
          trend: whatsappTotal ? Math.round((whatsappUnread || 0) / whatsappTotal * 100) : 0,
          recentActivity: formatActivity(whatsappMessages),
        },
        phone: {
          total: phoneTotal || 0,
          unread: phoneUnread || 0,
          urgent: urgentByChannel.phone,
          avgResponseTime: null,
          trend: phoneTotal ? Math.round((phoneUnread || 0) / phoneTotal * 100) : 0,
          recentActivity: formatActivity(phoneMessages),
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching communications stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch communications stats' });
  }
});

// Get reports (validator and above)
router.get('/reports', requirePermission(Permission.VIEW_REPORTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { period = '7d' } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    switch (period) {
      case '24h': startDate.setHours(startDate.getHours() - 24); break;
      case '7d': startDate.setDate(startDate.getDate() - 7); break;
      case '30d': startDate.setDate(startDate.getDate() - 30); break;
      case '90d': startDate.setDate(startDate.getDate() - 90); break;
      default: startDate.setDate(startDate.getDate() - 7);
    }

    // Get threads in range
    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    // Get messages in range
    const { data: messages } = await supabaseAdmin
      .from('communication_messages')
      .select('id, channel, direction, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    res.json({
      success: true,
      data: {
        period,
        dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
        summary: {
          threadsCreated: threads?.length || 0,
          messagesProcessed: messages?.length || 0,
          inboundMessages: messages?.filter((m: any) => m.direction === 'INBOUND').length || 0,
          outboundMessages: messages?.filter((m: any) => m.direction === 'OUTBOUND').length || 0,
        },
        channelBreakdown: {
          email: messages?.filter((m: any) => m.channel === 'EMAIL').length || 0,
          whatsapp: messages?.filter((m: any) => m.channel === 'WHATSAPP').length || 0,
          sms: messages?.filter((m: any) => m.channel === 'SMS').length || 0,
          voice: messages?.filter((m: any) => m.channel === 'VOICE').length || 0,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error fetching reports', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// Export reports (manager and above)
router.post('/reports/export', requirePermission(Permission.EXPORT_REPORTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type, period, format = 'json' } = req.body;

    // For now, return JSON data (CSV/Excel export can be added later)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (period === '30d' ? 30 : 7));

    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    res.json({
      success: true,
      data: {
        exportType: type,
        format,
        generatedAt: new Date().toISOString(),
        records: threads || [],
        recordCount: threads?.length || 0,
      },
    });
  } catch (error: any) {
    logger.error('Error exporting reports', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to export reports' });
  }
});

// ============================================================================
// Rate Management & Quotation Analytics (Phase 7)
// ============================================================================

/**
 * GET /api/v1/analytics/rate-cards
 * Get rate card performance metrics
 */
router.get('/rate-cards', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    const from = dateFrom ? new Date(dateFrom as string) : undefined;
    const to = dateTo ? new Date(dateTo as string) : undefined;

    const performance = await analyticsService.getRateCardPerformance(from, to);

    res.json({
      success: true,
      data: performance,
      count: performance.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /analytics/rate-cards', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate card analytics',
    });
  }
});

/**
 * GET /api/v1/analytics/shippers
 * Get shipper performance metrics
 */
router.get('/shippers', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const performance = await analyticsService.getShipperPerformance();

    res.json({
      success: true,
      data: performance,
      count: performance.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /analytics/shippers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipper analytics',
    });
  }
});

/**
 * GET /api/v1/analytics/quotes
 * Get quote analytics
 */
router.get('/quotes', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    const from = dateFrom ? new Date(dateFrom as string) : undefined;
    const to = dateTo ? new Date(dateTo as string) : undefined;

    const analytics = await analyticsService.getQuoteAnalytics(from, to);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    logger.error('Error in GET /analytics/quotes', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quote analytics',
    });
  }
});

/**
 * GET /api/v1/analytics/expiring-rate-cards
 * Get expiring rate cards
 */
router.get('/expiring-rate-cards', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { days } = req.query;
    const daysThreshold = days ? parseInt(days as string) : 30;

    const expiring = await analyticsService.getExpiringRateCards(daysThreshold);

    res.json({
      success: true,
      data: expiring,
      count: expiring.length,
    });
  } catch (error: any) {
    logger.error('Error in GET /analytics/expiring-rate-cards', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expiring rate cards',
    });
  }
});

/**
 * GET /api/v1/analytics/margin
 * Get margin analysis
 */
router.get('/margin', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo } = req.query;

    const from = dateFrom ? new Date(dateFrom as string) : undefined;
    const to = dateTo ? new Date(dateTo as string) : undefined;

    const analysis = await analyticsService.getMarginAnalysis(from, to);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    logger.error('Error in GET /analytics/margin', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch margin analysis',
    });
  }
});

/**
 * GET /api/v1/analytics/rate-dashboard
 * Get comprehensive rate management dashboard data
 */
router.get('/rate-dashboard', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateFrom, dateTo, days } = req.query;

    const from = dateFrom ? new Date(dateFrom as string) : undefined;
    const to = dateTo ? new Date(dateTo as string) : undefined;
    const daysThreshold = days ? parseInt(days as string) : 30;

    // Fetch all analytics in parallel
    const [quoteAnalytics, marginAnalysis, expiringRateCards, shipperPerformance] =
      await Promise.all([
        analyticsService.getQuoteAnalytics(from, to),
        analyticsService.getMarginAnalysis(from, to),
        analyticsService.getExpiringRateCards(daysThreshold),
        analyticsService.getShipperPerformance(),
      ]);

    res.json({
      success: true,
      data: {
        quotes: quoteAnalytics,
        margin: marginAnalysis,
        expiring_rate_cards: {
          cards: expiringRateCards.slice(0, 10), // Top 10 most urgent
          total_count: expiringRateCards.length,
        },
        shippers: {
          performance: shipperPerformance.slice(0, 10), // Top 10 shippers
          total_count: shipperPerformance.length,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error in GET /analytics/rate-dashboard', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate dashboard analytics',
    });
  }
});

// ============================================================================
// Pipeline Queue & Parsing Progress
// ============================================================================

/**
 * GET /api/v1/analytics/pipeline-status
 * Shows the real-time parsing/correlation queue: how many threads are
 * correlated, how many are pending, how many failed, and the top
 * unprocessed senders. This is the "queue indicator" the user sees.
 */
router.get('/pipeline-status', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Thread correlation status breakdown
    const [
      totalResult,
      matchedResult,
      pendingResult,
      failedResult,
      messagesResult,
      // top unique senders with no CRM link
      uncorrelatedSendersResult,
      // recent correlations
      recentCorrelationsResult,
    ] = await Promise.all([
      safeQuery(supabaseAdmin.from('communication_threads').select('*', { count: 'exact' }).eq('archived', false)),
      safeQuery(supabaseAdmin.from('communication_threads').select('*', { count: 'exact' }).eq('correlation_status', 'matched')),
      safeQuery(supabaseAdmin.from('communication_threads').select('*', { count: 'exact' }).eq('correlation_status', 'pending')),
      safeQuery(supabaseAdmin.from('communication_threads').select('*', { count: 'exact' }).eq('correlation_status', 'failed')),
      safeQuery(supabaseAdmin.from('communication_messages').select('*', { count: 'exact' })),
      safeQuery(supabaseAdmin.from('communication_messages')
        .select('from_address')
        .eq('direction', 'INBOUND')
        .limit(500)),
      safeQuery(supabaseAdmin.from('communication_threads')
        .select('id, crm_customer_id, lead_classification, correlated_at')
        .eq('correlation_status', 'matched')
        .order('correlated_at', { ascending: false })
        .limit(10)),
    ]);

    // Count unique senders from messages
    const senderSet = new Set<string>();
    ((uncorrelatedSendersResult.data as any[]) || []).forEach((m: any) => {
      if (m.from_address) senderSet.add(m.from_address);
    });

    // CRM customers count
    const crmResult = await safeQuery(supabaseAdmin.from('crm_customers').select('*', { count: 'exact' }));

    const total = totalResult.count;
    const matched = matchedResult.count;
    const pending = pendingResult.count;
    const failed = failedResult.count;
    const notStarted = total - matched - pending - failed;

    res.json({
      success: true,
      data: {
        threads: {
          total,
          correlated: matched,
          pending,
          failed,
          not_started: notStarted > 0 ? notStarted : 0,
          progress_pct: total > 0 ? Math.round((matched / total) * 100) : 0,
        },
        messages: {
          total: messagesResult.count,
          unique_senders: senderSet.size,
        },
        crm: {
          total_customers: crmResult.count,
        },
        recent_correlations: ((recentCorrelationsResult.data as any[]) || []).map((t: any) => ({
          thread_id: t.id,
          classification: t.lead_classification,
          correlated_at: t.correlated_at,
        })),
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching pipeline status', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch pipeline status' });
  }
});

/**
 * POST /api/v1/analytics/backfill-correlation
 * Triggers correlation on all threads that have never been correlated.
 * Reads each thread's inbound messages to find the sender's email,
 * then queues a correlation job for each.
 * Returns immediately with the count queued — processing is async.
 */
router.post('/backfill-correlation', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { pool } = require('../../../config/pg-client');
    const { queueAgentResult } = require('../../../workers/agent-result.worker');

    // Single efficient query: get uncorrelated threads + first inbound sender in one JOIN
    const result = await pool.query(`
      SELECT DISTINCT ON (t.id)
        t.id AS thread_id,
        m.from_address,
        m.from_name
      FROM communication_threads t
      JOIN communication_messages m ON m.thread_id = t.id
      WHERE t.crm_customer_id IS NULL
        AND t.archived = false
        AND m.direction = 'INBOUND'
        AND m.from_address IS NOT NULL
      ORDER BY t.id, m.created_at ASC
      LIMIT 500
    `);

    const rows = result.rows || [];
    if (rows.length === 0) {
      res.json({ success: true, data: { queued: 0, message: 'No uncorrelated threads found' } });
      return;
    }

    // Queue all at once — BullMQ worker processes them serially (concurrency: 10)
    let queued = 0;
    for (const row of rows) {
      await queueAgentResult({
        resultType: 'correlation_complete',
        agentId: 'backfill',
        entityId: row.thread_id,
        payload: {
          threadId: row.thread_id,
          fromEmail: row.from_address,
          fromName: row.from_name || '',
        },
      }).catch(() => {});
      queued++;
    }

    logger.info('Backfill correlation started', { queued });

    res.json({
      success: true,
      data: {
        queued,
        message: `Queued ${queued} threads for correlation. Processing async — check /pipeline-status for progress.`,
      },
    });
  } catch (error: any) {
    logger.error('Error starting backfill', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to start backfill' });
  }
});

export default router;
