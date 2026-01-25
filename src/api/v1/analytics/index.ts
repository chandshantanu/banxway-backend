import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

// Get dashboard stats - main stats for the dashboard
router.get('/dashboard', requirePermission(Permission.VIEW_ANALYTICS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get shipment stats
    const { data: shipments, error: shipmentError } = await supabaseAdmin
      .from('shipments')
      .select('id, status');

    if (shipmentError) {
      logger.error('Error fetching shipments for analytics', { error: shipmentError });
    }

    const shipmentStats = {
      total: shipments?.length || 0,
      inTransit: shipments?.filter(s => s.status === 'IN_TRANSIT').length || 0,
      pending: shipments?.filter(s => ['DRAFT', 'PENDING', 'BOOKED'].includes(s.status)).length || 0,
      delivered: shipments?.filter(s => s.status === 'DELIVERED').length || 0,
      exceptions: shipments?.filter(s => s.status === 'EXCEPTION').length || 0,
    };

    // Get thread stats
    const { data: threads, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('id, status, priority, primary_channel, sla_status, created_at');

    if (threadError) {
      logger.error('Error fetching threads for analytics', { error: threadError });
    }

    const threadStats = {
      total: threads?.length || 0,
      open: threads?.filter(t => ['NEW', 'IN_PROGRESS', 'AWAITING_CLIENT', 'AWAITING_INTERNAL'].includes(t.status)).length || 0,
      resolved: threads?.filter(t => t.status === 'RESOLVED').length || 0,
      closed: threads?.filter(t => t.status === 'CLOSED').length || 0,
      highPriority: threads?.filter(t => ['HIGH', 'URGENT', 'CRITICAL'].includes(t.priority)).length || 0,
      slaBreach: threads?.filter(t => t.sla_status === 'BREACHED').length || 0,
    };

    // Get channel breakdown
    const channelBreakdown = {
      email: threads?.filter(t => t.primary_channel === 'EMAIL').length || 0,
      whatsapp: threads?.filter(t => t.primary_channel === 'WHATSAPP').length || 0,
      sms: threads?.filter(t => t.primary_channel === 'SMS').length || 0,
      voice: threads?.filter(t => t.primary_channel === 'VOICE').length || 0,
      portal: threads?.filter(t => t.primary_channel === 'PORTAL').length || 0,
    };

    // Get message stats
    const { count: messageCount } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true });

    // Get customer stats
    const { count: customerCount } = await supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact', head: true });

    // Get user stats
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, role, is_active');

    const userStats = {
      total: users?.length || 0,
      active: users?.filter(u => u.is_active).length || 0,
      byRole: {
        admin: users?.filter(u => u.role === 'admin').length || 0,
        manager: users?.filter(u => u.role === 'manager').length || 0,
        validator: users?.filter(u => u.role === 'validator').length || 0,
        support: users?.filter(u => u.role === 'support').length || 0,
        viewer: users?.filter(u => u.role === 'viewer').length || 0,
      }
    };

    // Get recent activity (last 7 days trend)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentThreads } = await supabaseAdmin
      .from('communication_threads')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    // Group by day
    const dailyTrend = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toISOString().split('T')[0];
      const count = recentThreads?.filter(t => t.created_at.startsWith(dateStr)).length || 0;
      return { date: dateStr, count };
    });

    res.json({
      success: true,
      data: {
        shipments: shipmentStats,
        threads: threadStats,
        channels: channelBreakdown,
        messages: { total: messageCount || 0 },
        customers: { total: customerCount || 0 },
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
    const teamStats = users?.filter(u => u.is_active).map(user => {
      const userThreads = threads?.filter(t => t.assigned_to === user.id) || [];
      const resolved = userThreads.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');

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
      withinSla: threads?.filter(t => t.sla_status === 'ON_TRACK' || t.sla_status === 'MET').length || 0,
      atRisk: threads?.filter(t => t.sla_status === 'AT_RISK').length || 0,
      breached: threads?.filter(t => t.sla_status === 'BREACHED').length || 0,
      complianceRate: 0,
    };

    if (slaStats.total > 0) {
      slaStats.complianceRate = Math.round((slaStats.withinSla / slaStats.total) * 100);
    }

    // SLA by priority
    const byPriority = {
      critical: threads?.filter(t => t.priority === 'CRITICAL').length || 0,
      urgent: threads?.filter(t => t.priority === 'URGENT').length || 0,
      high: threads?.filter(t => t.priority === 'HIGH').length || 0,
      medium: threads?.filter(t => t.priority === 'MEDIUM').length || 0,
      low: threads?.filter(t => t.priority === 'LOW').length || 0,
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

    // Get email messages
    const { data: emailMessages } = await supabaseAdmin
      .from('communication_messages')
      .select('id, from_address, subject, created_at, is_read, thread_id')
      .eq('channel', 'EMAIL')
      .eq('direction', 'INBOUND')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get WhatsApp messages
    const { data: whatsappMessages } = await supabaseAdmin
      .from('communication_messages')
      .select('id, from_address, subject, created_at, is_read, thread_id')
      .eq('channel', 'WHATSAPP')
      .eq('direction', 'INBOUND')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get Voice/Phone messages
    const { data: phoneMessages } = await supabaseAdmin
      .from('communication_messages')
      .select('id, from_address, subject, created_at, is_read, thread_id')
      .eq('channel', 'VOICE')
      .eq('direction', 'INBOUND')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get SMS messages
    const { data: smsMessages } = await supabaseAdmin
      .from('communication_messages')
      .select('id, from_address, subject, created_at, is_read, thread_id')
      .eq('channel', 'SMS')
      .eq('direction', 'INBOUND')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get counts per channel
    const { count: emailTotal } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'EMAIL');

    const { count: emailUnread } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'EMAIL')
      .eq('is_read', false);

    const { count: whatsappTotal } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'WHATSAPP');

    const { count: whatsappUnread } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'WHATSAPP')
      .eq('is_read', false);

    const { count: phoneTotal } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'VOICE');

    const { count: phoneUnread } = await supabaseAdmin
      .from('communication_messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel', 'VOICE')
      .eq('is_read', false);

    // Get urgent threads (high priority, not resolved)
    const { data: urgentThreads } = await supabaseAdmin
      .from('communication_threads')
      .select('id, primary_channel')
      .in('priority', ['HIGH', 'URGENT', 'CRITICAL'])
      .not('status', 'in', '("RESOLVED","CLOSED")');

    const urgentByChannel = {
      email: urgentThreads?.filter(t => t.primary_channel === 'EMAIL').length || 0,
      whatsapp: urgentThreads?.filter(t => t.primary_channel === 'WHATSAPP').length || 0,
      phone: urgentThreads?.filter(t => t.primary_channel === 'VOICE').length || 0,
    };

    // Format recent activity
    const formatActivity = (messages: any[] | null) => {
      if (!messages) return [];
      return messages.map(m => ({
        id: m.id,
        from: m.from_address || 'Unknown',
        subject: m.subject || undefined,
        timestamp: new Date(m.created_at),
        isUnread: !m.is_read,
      }));
    };

    res.json({
      success: true,
      data: {
        email: {
          total: emailTotal || 0,
          unread: emailUnread || 0,
          urgent: urgentByChannel.email,
          avgResponseTime: 45, // TODO: Calculate actual avg response time
          trend: 0, // TODO: Calculate trend
          recentActivity: formatActivity(emailMessages),
        },
        whatsapp: {
          total: whatsappTotal || 0,
          unread: whatsappUnread || 0,
          urgent: urgentByChannel.whatsapp,
          avgResponseTime: 18,
          trend: 0,
          recentActivity: formatActivity(whatsappMessages),
        },
        phone: {
          total: phoneTotal || 0,
          unread: phoneUnread || 0,
          urgent: urgentByChannel.phone,
          avgResponseTime: 120,
          trend: 0,
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
          inboundMessages: messages?.filter(m => m.direction === 'INBOUND').length || 0,
          outboundMessages: messages?.filter(m => m.direction === 'OUTBOUND').length || 0,
        },
        channelBreakdown: {
          email: messages?.filter(m => m.channel === 'EMAIL').length || 0,
          whatsapp: messages?.filter(m => m.channel === 'WHATSAPP').length || 0,
          sms: messages?.filter(m => m.channel === 'SMS').length || 0,
          voice: messages?.filter(m => m.channel === 'VOICE').length || 0,
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

export default router;
