import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ShipmentType = 'AIR_IMPORT' | 'AIR_EXPORT' | 'ODC_IMPORT' | 'ODC_EXPORT' | 'BREAK_BULK_IMPORT' | 'BREAK_BULK_EXPORT' | 'SEA_AIR_THIRD_COUNTRY';

export type ShipmentStage =
  | 'QUOTE_REQUEST'
  | 'QUOTATION'
  | 'BOOKING'
  | 'DOCUMENTATION'
  | 'CUSTOMS_CLEARANCE'
  | 'CARGO_COLLECTION'
  | 'IN_TRANSIT'
  | 'PORT_ARRIVAL'
  | 'CUSTOMS_DELIVERY'
  | 'FINAL_DELIVERY'
  | 'POD_COLLECTION'
  | 'BILLING'
  | 'CLOSURE';

export interface Shipment {
  id: string;
  reference: string;
  quotation_id: string | null;
  customer_id: string | null;
  shipment_type: ShipmentType | null;
  current_stage: ShipmentStage;
  workflow_instance_id: string | null;
  service_type: string;
  cargo_type: string | null;
  origin_country: string | null;
  origin_city: string | null;
  origin_port: string | null;
  destination_country: string | null;
  destination_city: string | null;
  destination_port: string | null;
  cargo_data: any | null;
  status: string;
  current_location: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentStageHistory {
  id: string;
  shipment_id: string;
  from_stage: ShipmentStage | null;
  to_stage: ShipmentStage;
  notes: string | null;
  changed_by: string | null;
  duration_in_stage_hours: number | null;
  changed_at: string;
}

export interface CreateShipmentRequest {
  quotation_id?: string;
  customer_id?: string;
  shipment_type: ShipmentType;
  service_type: string;
  cargo_type?: string;
  origin_country?: string;
  origin_city?: string;
  origin_port?: string;
  destination_country?: string;
  destination_city?: string;
  destination_port?: string;
  cargo_data?: any;
  current_stage?: ShipmentStage;
  workflow_instance_id?: string;
}

export interface UpdateShipmentRequest {
  quotation_id?: string;
  customer_id?: string;
  shipment_type?: ShipmentType;
  current_stage?: ShipmentStage;
  workflow_instance_id?: string;
  service_type?: string;
  cargo_type?: string;
  origin_country?: string;
  origin_city?: string;
  origin_port?: string;
  destination_country?: string;
  destination_city?: string;
  destination_port?: string;
  cargo_data?: any;
  status?: string;
  current_location?: string;
}

export interface ShipmentFilters {
  status?: string[];
  shipment_type?: ShipmentType;
  current_stage?: ShipmentStage;
  customer_id?: string;
  quotation_id?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Repository Class
// ============================================================================

export class ShipmentRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('shipments') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all shipments with filters and pagination
   */
  async findAll(
    filters: ShipmentFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    shipments: Shipment[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      status,
      shipment_type,
      current_stage,
      customer_id,
      quotation_id,
      dateFrom,
      dateTo,
      search,
    } = filters;

    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = supabaseAdmin.from('shipments').select('*', { count: 'exact' });

    // Apply filters
    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (shipment_type) {
      query = query.eq('shipment_type', shipment_type);
    }

    if (current_stage) {
      query = query.eq('current_stage', current_stage);
    }

    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }

    if (quotation_id) {
      query = query.eq('quotation_id', quotation_id);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo.toISOString());
    }

    if (search) {
      query = query.or(`reference.ilike.%${search}%,current_location.ilike.%${search}%`);
    }

    // Pagination and sorting
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Shipments table not found - returning empty array');
        return {
          shipments: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      logger.error('Error fetching shipments', { error: error.message });
      throw error;
    }

    return {
      shipments: data as Shipment[],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Find shipment by ID
   */
  async findById(id: string): Promise<Shipment | null> {
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Shipments table not found - returning null');
        return null;
      }

      logger.error('Error fetching shipment', { id, error: error.message });
      throw error;
    }

    return data as Shipment;
  }

  /**
   * Find shipment by reference
   */
  async findByReference(reference: string): Promise<Shipment | null> {
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .select('*')
      .eq('reference', reference)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Shipments table not found - returning null');
        return null;
      }

      logger.error('Error fetching shipment by reference', { reference, error: error.message });
      throw error;
    }

    return data as Shipment;
  }

  /**
   * Find shipments by quotation
   */
  async findByQuotation(quotationId: string): Promise<Shipment[]> {
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Shipments table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching shipments by quotation', { quotationId, error: error.message });
      throw error;
    }

    return data as Shipment[];
  }

  /**
   * Create new shipment
   */
  async create(shipmentData: CreateShipmentRequest): Promise<Shipment> {
    // Generate reference number (could use a database function similar to quote_number)
    const reference = `SH-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const newShipment = {
      ...shipmentData,
      reference,
      current_stage: shipmentData.current_stage || 'BOOKING',
      status: 'DRAFT',
    };

    const { data, error } = await supabaseAdmin
      .from('shipments')
      .insert(newShipment)
      .select()
      .single();

    if (error) {
      logger.error('Error creating shipment', { error: error.message });
      throw error;
    }

    logger.info('Shipment created', { id: data.id, reference: data.reference });
    return data as Shipment;
  }

  /**
   * Update shipment
   * Note: Stage transitions are automatically tracked by database trigger
   */
  async update(id: string, updates: UpdateShipmentRequest): Promise<Shipment> {
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating shipment', { id, error: error.message });
      throw error;
    }

    logger.info('Shipment updated', {
      id,
      current_stage: data.current_stage,
      status: data.status,
    });
    return data as Shipment;
  }

  /**
   * Update shipment stage (triggers automatic stage history tracking)
   */
  async updateStage(id: string, newStage: ShipmentStage, userId?: string): Promise<Shipment> {
    return this.update(id, { current_stage: newStage });
  }

  /**
   * Get stage history for shipment
   */
  async getStageHistory(shipmentId: string): Promise<ShipmentStageHistory[]> {
    const { data, error } = await supabaseAdmin
      .from('shipment_stage_history')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('changed_at', { ascending: true });

    if (error) {
      logger.error('Error fetching stage history', { shipmentId, error: error.message });
      throw error;
    }

    return data as ShipmentStageHistory[];
  }

  /**
   * Delete shipment
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('shipments').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting shipment', { id, error: error.message });
      throw error;
    }

    logger.info('Shipment deleted', { id });
  }

  /**
   * Get shipments by current stage
   */
  async findByStage(stage: ShipmentStage): Promise<Shipment[]> {
    const { data, error } = await supabaseAdmin
      .from('shipments')
      .select('*')
      .eq('current_stage', stage)
      .order('created_at', { ascending: true });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Shipments table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching shipments by stage', { stage, error: error.message });
      throw error;
    }

    return data as Shipment[];
  }

  /**
   * Get average time spent in each stage (analytics)
   */
  async getStageAnalytics(): Promise<
    Array<{
      stage: ShipmentStage;
      avg_hours: number;
      shipment_count: number;
    }>
  > {
    const { data, error } = await supabaseAdmin
      .from('shipment_stage_history')
      .select('to_stage, duration_in_stage_hours');

    if (error) {
      logger.error('Error fetching stage analytics', { error: error.message });
      throw error;
    }

    // Group by stage and calculate averages
    const stageMap = new Map<
      ShipmentStage,
      { total_hours: number; count: number }
    >();

    (data as ShipmentStageHistory[]).forEach((record) => {
      if (record.duration_in_stage_hours !== null && record.to_stage) {
        const existing = stageMap.get(record.to_stage) || { total_hours: 0, count: 0 };
        existing.total_hours += record.duration_in_stage_hours;
        existing.count += 1;
        stageMap.set(record.to_stage, existing);
      }
    });

    const analytics = Array.from(stageMap.entries()).map(([stage, stats]) => ({
      stage,
      avg_hours: Math.round((stats.total_hours / stats.count) * 100) / 100,
      shipment_count: stats.count,
    }));

    return analytics;
  }
}

export default new ShipmentRepository();
