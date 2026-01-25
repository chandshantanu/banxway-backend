import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

/**
 * Queue API
 * The "queue" represents items that need validation/review.
 * These can be:
 * - Shipments awaiting approval
 * - Communication threads needing review
 * - Documents pending validation
 *
 * This API aggregates these from various sources and presents them as queue items.
 */

interface QueueItem {
  id: string;
  type: 'shipment' | 'thread' | 'document';
  reference: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  channel?: string;
  customer?: {
    id: string;
    name: string;
    company?: string;
  };
  assignedTo?: string;
  assignedToName?: string;
  confidence?: number;
  createdAt: string;
  dueAt?: string;
  metadata?: any;
}

// Get all queue items (aggregated from various sources)
router.get('/', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      type,
      priority,
      status,
      assigned_to,
      channel,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const queueItems: QueueItem[] = [];

    // 1. Get shipments pending approval/validation
    let shipmentQuery = supabaseAdmin
      .from('shipments')
      .select('*, customers(id, name, company)')
      .in('status', ['DRAFT', 'PENDING', 'EXCEPTION']);

    if (search) {
      shipmentQuery = shipmentQuery.or(`reference.ilike.%${search}%,origin_city.ilike.%${search}%,destination_city.ilike.%${search}%`);
    }

    const { data: shipments } = await shipmentQuery;

    shipments?.forEach(shipment => {
      queueItems.push({
        id: shipment.id,
        type: 'shipment',
        reference: shipment.reference,
        title: `Shipment ${shipment.reference}`,
        description: `${shipment.origin_city || 'Origin'} → ${shipment.destination_city || 'Destination'} | ${shipment.service_type}`,
        priority: shipment.status === 'EXCEPTION' ? 'HIGH' : 'MEDIUM',
        status: shipment.status,
        customer: shipment.customers ? {
          id: shipment.customers.id,
          name: shipment.customers.name,
          company: shipment.customers.company,
        } : undefined,
        confidence: 0.85, // Could be calculated based on data completeness
        createdAt: shipment.created_at,
        metadata: {
          serviceType: shipment.service_type,
          cargoType: shipment.cargo_type,
          origin: shipment.origin_city,
          destination: shipment.destination_city,
        },
      });
    });

    // 2. Get threads needing review (new, high priority, or with SLA risk)
    let threadQuery = supabaseAdmin
      .from('communication_threads')
      .select('*, customers(id, name, company), users!communication_threads_assigned_to_fkey(id, full_name)')
      .or('status.eq.NEW,priority.in.(HIGH,URGENT,CRITICAL),sla_status.eq.AT_RISK');

    if (channel) {
      threadQuery = threadQuery.eq('primary_channel', channel);
    }
    if (assigned_to) {
      threadQuery = threadQuery.eq('assigned_to', assigned_to);
    }
    if (search) {
      threadQuery = threadQuery.or(`reference.ilike.%${search}%`);
    }

    const { data: threads } = await threadQuery;

    threads?.forEach(thread => {
      queueItems.push({
        id: thread.id,
        type: 'thread',
        reference: thread.reference,
        title: `Thread ${thread.reference}`,
        description: `${thread.type} - ${thread.status}`,
        priority: thread.priority,
        status: thread.status,
        channel: thread.primary_channel,
        customer: thread.customers ? {
          id: thread.customers.id,
          name: thread.customers.name,
          company: thread.customers.company,
        } : undefined,
        assignedTo: thread.assigned_to,
        assignedToName: thread.users?.full_name,
        confidence: thread.workflow_state?.confidence || 0.75,
        createdAt: thread.created_at,
        dueAt: thread.sla_deadline,
        metadata: {
          slaStatus: thread.sla_status,
          tatStatus: thread.tat_status,
          workflowStage: thread.workflow_stage,
        },
      });
    });

    // 3. Get pending actions
    const { data: actions } = await supabaseAdmin
      .from('communication_actions')
      .select('*, communication_threads(id, reference), users!communication_actions_assigned_to_fkey(id, full_name)')
      .in('status', ['PENDING', 'IN_PROGRESS'])
      .order('due_at', { ascending: true, nullsFirst: false });

    actions?.forEach(action => {
      queueItems.push({
        id: action.id,
        type: 'document',
        reference: action.communication_threads?.reference || 'N/A',
        title: action.title,
        description: action.description || action.type,
        priority: action.priority,
        status: action.status,
        assignedTo: action.assigned_to,
        assignedToName: action.users?.full_name,
        confidence: action.confidence_score || 0.8,
        createdAt: action.created_at,
        dueAt: action.due_at,
        metadata: {
          actionType: action.type,
          riskLevel: action.risk_level,
          aiGenerated: action.ai_generated,
        },
      });
    });

    // Apply type filter
    let filteredItems = queueItems;
    if (type) {
      filteredItems = filteredItems.filter(item => item.type === type);
    }
    if (priority) {
      filteredItems = filteredItems.filter(item => item.priority === priority);
    }
    if (status) {
      filteredItems = filteredItems.filter(item => item.status === status);
    }

    // Sort by priority and date
    const priorityOrder: Record<string, number> = { CRITICAL: 0, URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
    filteredItems.sort((a, b) => {
      const priorityDiff = (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const start = (pageNum - 1) * limitNum;
    const paginatedItems = filteredItems.slice(start, start + limitNum);

    // Calculate stats
    const stats = {
      total: filteredItems.length,
      byType: {
        shipment: filteredItems.filter(i => i.type === 'shipment').length,
        thread: filteredItems.filter(i => i.type === 'thread').length,
        document: filteredItems.filter(i => i.type === 'document').length,
      },
      byPriority: {
        critical: filteredItems.filter(i => i.priority === 'CRITICAL').length,
        urgent: filteredItems.filter(i => i.priority === 'URGENT').length,
        high: filteredItems.filter(i => i.priority === 'HIGH').length,
        medium: filteredItems.filter(i => i.priority === 'MEDIUM').length,
        low: filteredItems.filter(i => i.priority === 'LOW').length,
      },
      avgConfidence: filteredItems.length > 0
        ? Math.round((filteredItems.reduce((sum, i) => sum + (i.confidence || 0), 0) / filteredItems.length) * 100)
        : 0,
    };

    res.json({
      success: true,
      data: paginatedItems,
      stats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredItems.length,
        totalPages: Math.ceil(filteredItems.length / limitNum),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching queue items', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch queue items' });
  }
});

// Get single queue item by ID and type
router.get('/:type/:id', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;

    let data: any = null;

    switch (type) {
      case 'shipment':
        const { data: shipment } = await supabaseAdmin
          .from('shipments')
          .select('*, customers(id, name, company, email, phone)')
          .eq('id', id)
          .single();
        data = shipment;
        break;

      case 'thread':
        const { data: thread } = await supabaseAdmin
          .from('communication_threads')
          .select('*, customers(id, name, company, email, phone), users!communication_threads_assigned_to_fkey(id, full_name, email)')
          .eq('id', id)
          .single();

        if (thread) {
          // Get messages
          const { data: messages } = await supabaseAdmin
            .from('communication_messages')
            .select('*')
            .eq('thread_id', id)
            .order('created_at', { ascending: true });

          data = { ...thread, messages };
        }
        break;

      case 'document':
      case 'action':
        const { data: action } = await supabaseAdmin
          .from('communication_actions')
          .select('*, communication_threads(id, reference, status), users!communication_actions_assigned_to_fkey(id, full_name, email)')
          .eq('id', id)
          .single();
        data = action;
        break;

      default:
        res.status(400).json({ success: false, error: 'Invalid queue item type' });
        return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: 'Queue item not found' });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error fetching queue item', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch queue item' });
  }
});

// Approve/Process a queue item
router.post('/:type/:id/approve', requirePermission(Permission.APPROVE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;
    const { notes, action } = req.body;

    let result: any = null;

    switch (type) {
      case 'shipment':
        const { data: shipment, error: shipmentError } = await supabaseAdmin
          .from('shipments')
          .update({
            status: action === 'reject' ? 'CANCELLED' : 'BOOKED',
            cargo_data: {
              approved_by: req.user?.id,
              approved_at: new Date().toISOString(),
              approval_notes: notes,
              approval_action: action,
            },
          })
          .eq('id', id)
          .select()
          .single();

        if (shipmentError) throw shipmentError;
        result = shipment;
        break;

      case 'thread':
        const newStatus = action === 'close' ? 'CLOSED' : action === 'resolve' ? 'RESOLVED' : 'IN_PROGRESS';
        const { data: thread, error: threadError } = await supabaseAdmin
          .from('communication_threads')
          .update({
            status: newStatus,
            resolved_at: ['CLOSED', 'RESOLVED'].includes(newStatus) ? new Date().toISOString() : null,
          })
          .eq('id', id)
          .select()
          .single();

        if (threadError) throw threadError;
        result = thread;
        break;

      case 'document':
      case 'action':
        const { data: actionItem, error: actionError } = await supabaseAdmin
          .from('communication_actions')
          .update({
            status: action === 'skip' ? 'SKIPPED' : 'COMPLETED',
            completed_at: new Date().toISOString(),
            execution_result: { notes, approved_by: req.user?.id },
          })
          .eq('id', id)
          .select()
          .single();

        if (actionError) throw actionError;
        result = actionItem;
        break;

      default:
        res.status(400).json({ success: false, error: 'Invalid queue item type' });
        return;
    }

    logger.info('Queue item processed', { type, id, action, userId: req.user?.id });

    res.json({
      success: true,
      data: result,
      message: 'Item processed successfully',
    });
  } catch (error: any) {
    logger.error('Error processing queue item', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to process queue item' });
  }
});

// Assign queue item to user
router.post('/:type/:id/assign', requirePermission(Permission.ASSIGN_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { type, id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    let result: any = null;

    switch (type) {
      case 'thread':
        const { data: thread, error: threadError } = await supabaseAdmin
          .from('communication_threads')
          .update({ assigned_to: user_id })
          .eq('id', id)
          .select('*, users!communication_threads_assigned_to_fkey(id, full_name)')
          .single();

        if (threadError) throw threadError;
        result = thread;
        break;

      case 'document':
      case 'action':
        const { data: action, error: actionError } = await supabaseAdmin
          .from('communication_actions')
          .update({ assigned_to: user_id, assigned_at: new Date().toISOString() })
          .eq('id', id)
          .select('*, users!communication_actions_assigned_to_fkey(id, full_name)')
          .single();

        if (actionError) throw actionError;
        result = action;
        break;

      default:
        res.status(400).json({ success: false, error: 'Cannot assign this item type' });
        return;
    }

    logger.info('Queue item assigned', { type, id, assignedTo: user_id });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Error assigning queue item', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to assign queue item' });
  }
});

// Get queue stats summary
router.get('/stats/summary', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get pending shipments count
    const { count: pendingShipments } = await supabaseAdmin
      .from('shipments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['DRAFT', 'PENDING', 'EXCEPTION']);

    // Get pending threads count
    const { count: pendingThreads } = await supabaseAdmin
      .from('communication_threads')
      .select('*', { count: 'exact', head: true })
      .or('status.eq.NEW,priority.in.(HIGH,URGENT,CRITICAL),sla_status.eq.AT_RISK');

    // Get pending actions count
    const { count: pendingActions } = await supabaseAdmin
      .from('communication_actions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['PENDING', 'IN_PROGRESS']);

    // Get high priority count
    const { count: highPriorityThreads } = await supabaseAdmin
      .from('communication_threads')
      .select('*', { count: 'exact', head: true })
      .in('priority', ['HIGH', 'URGENT', 'CRITICAL'])
      .in('status', ['NEW', 'IN_PROGRESS']);

    const total = (pendingShipments || 0) + (pendingThreads || 0) + (pendingActions || 0);

    res.json({
      success: true,
      data: {
        total,
        pendingShipments: pendingShipments || 0,
        pendingThreads: pendingThreads || 0,
        pendingActions: pendingActions || 0,
        highPriority: highPriorityThreads || 0,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching queue stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch queue stats' });
  }
});

export default router;
