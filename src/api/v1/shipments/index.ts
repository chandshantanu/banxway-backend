import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';
import shipmentService, { ShipmentError, ShipmentNotFoundError } from '../../../services/shipment.service';

const router = Router();
router.use(authenticateRequest);

// Generate unique reference number
function generateReference(): string {
  const prefix = 'SHP';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Get all shipments with filtering and pagination
router.get('/', requirePermission(Permission.VIEW_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      status,
      service_type,
      customer_id,
      search,
      page = '1',
      limit = '20',
      sort_by = 'created_at',
      sort_order = 'desc',
    } = req.query;

    let query = supabaseAdmin
      .from('shipments')
      .select('*, customers(id, name, company, email)', { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (service_type) {
      query = query.eq('service_type', service_type);
    }
    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }
    if (search) {
      query = query.or(`reference.ilike.%${search}%,origin_city.ilike.%${search}%,destination_city.ilike.%${search}%`);
    }

    // Apply sorting
    const ascending = sort_order === 'asc';
    query = query.order(sort_by as string, { ascending });

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Error fetching shipments', { error });
      res.status(500).json({ success: false, error: 'Failed to fetch shipments' });
      return;
    }

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error: any) {
    logger.error('Error in GET /shipments', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get single shipment by ID
router.get('/:id', requirePermission(Permission.VIEW_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('shipments')
      .select('*, customers(id, name, company, email, phone)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ success: false, error: 'Shipment not found' });
        return;
      }
      throw error;
    }

    // Get related threads
    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('id, reference, status, priority, primary_channel, created_at')
      .eq('shipment_id', id)
      .order('created_at', { ascending: false });

    res.json({
      success: true,
      data: {
        ...data,
        threads: threads || [],
      },
    });
  } catch (error: any) {
    logger.error('Error fetching shipment', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch shipment' });
  }
});

// Create shipment
router.post('/', requirePermission(Permission.CREATE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      customer_id,
      service_type,
      cargo_type,
      origin_country,
      origin_city,
      origin_port,
      destination_country,
      destination_city,
      destination_port,
      cargo_data,
      cargo_ready_date,
      estimated_departure,
      estimated_arrival,
    } = req.body;

    // Validate required fields
    if (!service_type) {
      res.status(400).json({ success: false, error: 'Service type is required' });
      return;
    }

    const shipmentData = {
      reference: generateReference(),
      customer_id,
      service_type,
      cargo_type: cargo_type || 'GENERAL',
      origin_country,
      origin_city,
      origin_port,
      destination_country,
      destination_city,
      destination_port,
      cargo_data: cargo_data || {},
      status: 'DRAFT',
      cargo_ready_date,
      estimated_departure,
      estimated_arrival,
    };

    const { data, error } = await supabaseAdmin
      .from('shipments')
      .insert(shipmentData)
      .select('*, customers(id, name, company)')
      .single();

    if (error) {
      logger.error('Error creating shipment', { error });
      res.status(500).json({ success: false, error: 'Failed to create shipment' });
      return;
    }

    logger.info('Shipment created', { shipmentId: data.id, reference: data.reference });

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error in POST /shipments', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update shipment
router.patch('/:id', requirePermission(Permission.UPDATE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.reference;
    delete updates.created_at;

    const { data, error } = await supabaseAdmin
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select('*, customers(id, name, company)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ success: false, error: 'Shipment not found' });
        return;
      }
      throw error;
    }

    logger.info('Shipment updated', { shipmentId: id, updates: Object.keys(updates) });

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error updating shipment', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update shipment' });
  }
});

// Delete shipment (soft delete by setting status)
router.delete('/:id', requirePermission(Permission.DELETE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if shipment exists
    const { data: existing } = await supabaseAdmin
      .from('shipments')
      .select('id, reference')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({ success: false, error: 'Shipment not found' });
      return;
    }

    // Soft delete by setting status to CANCELLED
    const { error } = await supabaseAdmin
      .from('shipments')
      .update({ status: 'CANCELLED' })
      .eq('id', id);

    if (error) {
      throw error;
    }

    logger.info('Shipment deleted', { shipmentId: id });

    res.json({
      success: true,
      message: 'Shipment deleted successfully',
    });
  } catch (error: any) {
    logger.error('Error deleting shipment', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete shipment' });
  }
});

// Approve shipment (change status from DRAFT to BOOKED)
router.post('/:id/approve', requirePermission(Permission.APPROVE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Get current shipment
    const { data: shipment, error: fetchError } = await supabaseAdmin
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !shipment) {
      res.status(404).json({ success: false, error: 'Shipment not found' });
      return;
    }

    // Validate shipment can be approved
    if (shipment.status !== 'DRAFT' && shipment.status !== 'PENDING') {
      res.status(400).json({
        success: false,
        error: `Cannot approve shipment with status: ${shipment.status}`,
      });
      return;
    }

    // Update status to BOOKED
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .update({
        status: 'BOOKED',
        cargo_data: {
          ...shipment.cargo_data,
          approved_by: req.user?.id,
          approved_at: new Date().toISOString(),
          approval_notes: notes,
        },
      })
      .eq('id', id)
      .select('*, customers(id, name, company)')
      .single();

    if (error) {
      throw error;
    }

    logger.info('Shipment approved', { shipmentId: id, approvedBy: req.user?.id });

    res.json({
      success: true,
      data,
      message: 'Shipment approved successfully',
    });
  } catch (error: any) {
    logger.error('Error approving shipment', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to approve shipment' });
  }
});

// Update shipment status
router.post('/:id/status', requirePermission(Permission.UPDATE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, current_location, notes } = req.body;

    const validStatuses = ['DRAFT', 'PENDING', 'BOOKED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'EXCEPTION', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status' });
      return;
    }

    const updates: any = { status };
    if (current_location) updates.current_location = current_location;
    if (status === 'IN_TRANSIT' && !updates.actual_departure) {
      updates.actual_departure = new Date().toISOString();
    }
    if (status === 'DELIVERED') {
      updates.actual_arrival = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select('*, customers(id, name, company)')
      .single();

    if (error) {
      throw error;
    }

    logger.info('Shipment status updated', { shipmentId: id, newStatus: status });

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error updating shipment status', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update shipment status' });
  }
});

// Get shipment stats summary
router.get('/stats/summary', requirePermission(Permission.VIEW_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data: shipments } = await supabaseAdmin
      .from('shipments')
      .select('status, service_type');

    const stats = {
      total: shipments?.length || 0,
      byStatus: {
        draft: shipments?.filter(s => s.status === 'DRAFT').length || 0,
        pending: shipments?.filter(s => s.status === 'PENDING').length || 0,
        booked: shipments?.filter(s => s.status === 'BOOKED').length || 0,
        inTransit: shipments?.filter(s => s.status === 'IN_TRANSIT').length || 0,
        arrived: shipments?.filter(s => s.status === 'ARRIVED').length || 0,
        delivered: shipments?.filter(s => s.status === 'DELIVERED').length || 0,
        exception: shipments?.filter(s => s.status === 'EXCEPTION').length || 0,
        cancelled: shipments?.filter(s => s.status === 'CANCELLED').length || 0,
      },
      byServiceType: {
        seaFcl: shipments?.filter(s => s.service_type === 'SEA_FCL').length || 0,
        seaLcl: shipments?.filter(s => s.service_type === 'SEA_LCL').length || 0,
        air: shipments?.filter(s => s.service_type === 'AIR').length || 0,
        road: shipments?.filter(s => s.service_type === 'ROAD').length || 0,
        rail: shipments?.filter(s => s.service_type === 'RAIL').length || 0,
        multimodal: shipments?.filter(s => s.service_type === 'MULTIMODAL').length || 0,
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Error fetching shipment stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch shipment stats' });
  }
});

// ============================================================================
// NEW ENDPOINTS: Stage Management (from new freight workflow implementation)
// ============================================================================

// Get shipment stage history
router.get('/:id/history', requirePermission(Permission.VIEW_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const history = await shipmentService.getStageHistory(id);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error: any) {
    if (error instanceof ShipmentNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error fetching shipment history', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipment history',
    });
  }
});

// Update shipment stage (with automatic history tracking)
router.patch('/:id/stage', requirePermission(Permission.UPDATE_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    const userId = req.user?.id;

    if (!stage) {
      res.status(400).json({
        success: false,
        error: 'Stage is required',
      });
      return;
    }

    const shipment = await shipmentService.updateShipmentStage(id, stage, userId);

    res.json({
      success: true,
      data: shipment,
      message: `Shipment stage updated to ${stage}`,
    });
  } catch (error: any) {
    if (error instanceof ShipmentNotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    if (error instanceof ShipmentError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    logger.error('Error updating shipment stage', { id: req.params.id, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update shipment stage',
    });
  }
});

// Get shipments by current stage
router.get('/stage/:stage', requirePermission(Permission.VIEW_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { stage } = req.params;
    const shipments = await shipmentService.getShipmentsByStage(stage as any);

    res.json({
      success: true,
      data: shipments,
      count: shipments.length,
    });
  } catch (error: any) {
    logger.error('Error fetching shipments by stage', { stage: req.params.stage, error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipments by stage',
    });
  }
});

// Get stage analytics (average time per stage)
router.get('/analytics/stages', requirePermission(Permission.VIEW_SHIPMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const analytics = await shipmentService.getStageAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    logger.error('Error fetching stage analytics', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stage analytics',
    });
  }
});

export default router;
