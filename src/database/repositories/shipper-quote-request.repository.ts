import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type QuoteRequestStatus = 'PENDING' | 'SENT' | 'RECEIVED' | 'DECLINED' | 'EXPIRED';

export interface ShipperQuoteRequest {
  id: string;
  request_number: string;
  quotation_id: string | null;
  shipper_id: string;
  shipment_type: string;
  commodity_type: string | null;
  origin_location: string;
  origin_country: string | null;
  destination_location: string;
  destination_country: string | null;
  gross_weight_kg: number;
  cargo_volume_cbm: number | null;
  dimensions: any;
  incoterm: string | null;
  special_handling: string | null;
  required_by_date: string | null;
  status: QuoteRequestStatus;
  shipper_quote_amount: number | null;
  shipper_quote_currency: string;
  shipper_quote_validity: string | null;
  shipper_quote_file_url: string | null;
  shipper_response_details: any;
  margin_percentage: number;
  margin_flat_fee: number;
  final_quote_amount: number | null;
  requested_at: string;
  responded_at: string | null;
  requested_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipperQuoteRequestWithShipper extends ShipperQuoteRequest {
  shipper_name?: string;
  shipper_type?: string;
  shipper_contact_email?: string;
}

export interface CreateShipperQuoteRequestRequest {
  quotation_id?: string;
  shipper_id: string;
  shipment_type: string;
  commodity_type?: string;
  origin_location: string;
  origin_country?: string;
  destination_location: string;
  destination_country?: string;
  gross_weight_kg: number;
  cargo_volume_cbm?: number;
  dimensions?: any;
  incoterm?: string;
  special_handling?: string;
  required_by_date?: string;
  margin_percentage?: number;
  margin_flat_fee?: number;
  requested_by?: string;
  notes?: string;
}

export interface UpdateShipperQuoteRequestRequest {
  status?: QuoteRequestStatus;
  shipper_quote_amount?: number;
  shipper_quote_currency?: string;
  shipper_quote_validity?: string;
  shipper_quote_file_url?: string;
  shipper_response_details?: any;
  responded_at?: string;
  notes?: string;
}

export interface ShipperQuoteRequestFilters {
  status?: QuoteRequestStatus[];
  shipper_id?: string;
  quotation_id?: string;
  requested_by?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

// ============================================================================
// Repository Class
// ============================================================================

export class ShipperQuoteRequestRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('shipper_quote_requests') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all quote requests with filters
   */
  async findAll(filters: ShipperQuoteRequestFilters = {}): Promise<ShipperQuoteRequestWithShipper[]> {
    let query = supabaseAdmin
      .from('shipper_quote_requests')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type,
          contact_email
        )
      `)
      .order('requested_at', { ascending: false });

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters.shipper_id) {
      query = query.eq('shipper_id', filters.shipper_id);
    }

    if (filters.quotation_id) {
      query = query.eq('quotation_id', filters.quotation_id);
    }

    if (filters.requested_by) {
      query = query.eq('requested_by', filters.requested_by);
    }

    if (filters.dateFrom) {
      query = query.gte('requested_at', filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
      query = query.lte('requested_at', filters.dateTo.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Shipper quote requests table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching shipper quote requests', { error: error.message });
      throw error;
    }

    return data.map((req: any) => ({
      ...req,
      shipper_name: req.shippers?.shipper_name,
      shipper_type: req.shippers?.shipper_type,
      shipper_contact_email: req.shippers?.contact_email,
      shippers: undefined,
    })) as ShipperQuoteRequestWithShipper[];
  }

  /**
   * Find quote request by ID
   */
  async findById(id: string): Promise<ShipperQuoteRequestWithShipper | null> {
    const { data, error } = await supabaseAdmin
      .from('shipper_quote_requests')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type,
          contact_email
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Shipper quote requests table not found - returning null');
        return null;
      }

      logger.error('Error fetching shipper quote request', { id, error: error.message });
      throw error;
    }

    return {
      ...data,
      shipper_name: data.shippers?.shipper_name,
      shipper_type: data.shippers?.shipper_type,
      shipper_contact_email: data.shippers?.contact_email,
      shippers: undefined,
    } as ShipperQuoteRequestWithShipper;
  }

  /**
   * Find quote requests by quotation ID
   */
  async findByQuotationId(quotationId: string): Promise<ShipperQuoteRequestWithShipper[]> {
    const { data, error } = await supabaseAdmin
      .from('shipper_quote_requests')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type,
          contact_email
        )
      `)
      .eq('quotation_id', quotationId)
      .order('requested_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Shipper quote requests table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching quote requests by quotation', {
        quotationId,
        error: error.message,
      });
      throw error;
    }

    return data.map((req: any) => ({
      ...req,
      shipper_name: req.shippers?.shipper_name,
      shipper_type: req.shippers?.shipper_type,
      shipper_contact_email: req.shippers?.contact_email,
      shippers: undefined,
    })) as ShipperQuoteRequestWithShipper[];
  }

  /**
   * Create new shipper quote request
   */
  async create(data: CreateShipperQuoteRequestRequest): Promise<ShipperQuoteRequestWithShipper> {
    // Generate request number
    const { data: requestNumber, error: requestNumError } = await supabaseAdmin.rpc(
      'generate_quote_request_number'
    );

    if (requestNumError) {
      logger.error('Error generating quote request number', { error: requestNumError.message });
      throw requestNumError;
    }

    const newRequest = {
      ...data,
      request_number: requestNumber,
      status: 'PENDING' as QuoteRequestStatus,
      shipper_quote_currency: 'USD',
      margin_percentage: data.margin_percentage || 15.0,
      margin_flat_fee: data.margin_flat_fee || 0,
      requested_at: new Date().toISOString(),
    };

    const { data: result, error } = await supabaseAdmin
      .from('shipper_quote_requests')
      .insert(newRequest)
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type,
          contact_email
        )
      `)
      .single();

    if (error) {
      logger.error('Error creating shipper quote request', { error: error.message });
      throw error;
    }

    logger.info('Shipper quote request created', {
      id: result.id,
      request_number: result.request_number,
    });

    return {
      ...result,
      shipper_name: result.shippers?.shipper_name,
      shipper_type: result.shippers?.shipper_type,
      shipper_contact_email: result.shippers?.contact_email,
      shippers: undefined,
    } as ShipperQuoteRequestWithShipper;
  }

  /**
   * Update shipper quote request
   */
  async update(
    id: string,
    updates: UpdateShipperQuoteRequestRequest
  ): Promise<ShipperQuoteRequestWithShipper> {
    // Calculate final quote amount if shipper amount provided
    if (updates.shipper_quote_amount !== undefined) {
      const request = await this.findById(id);
      if (request) {
        const marginAmount =
          (updates.shipper_quote_amount * request.margin_percentage) / 100 +
          request.margin_flat_fee;
        updates['final_quote_amount'] = updates.shipper_quote_amount + marginAmount;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('shipper_quote_requests')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type,
          contact_email
        )
      `)
      .single();

    if (error) {
      logger.error('Error updating shipper quote request', { id, error: error.message });
      throw error;
    }

    logger.info('Shipper quote request updated', { id, status: data.status });

    return {
      ...data,
      shipper_name: data.shippers?.shipper_name,
      shipper_type: data.shippers?.shipper_type,
      shipper_contact_email: data.shippers?.contact_email,
      shippers: undefined,
    } as ShipperQuoteRequestWithShipper;
  }

  /**
   * Delete shipper quote request
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('shipper_quote_requests')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting shipper quote request', { id, error: error.message });
      throw error;
    }

    logger.info('Shipper quote request deleted', { id });
  }

  /**
   * Get pending quote requests (PENDING or SENT status)
   */
  async findPending(): Promise<ShipperQuoteRequestWithShipper[]> {
    return this.findAll({ status: ['PENDING', 'SENT'] });
  }

  /**
   * Get received quote requests (ready to convert to quotations)
   */
  async findReceived(): Promise<ShipperQuoteRequestWithShipper[]> {
    return this.findAll({ status: ['RECEIVED'] });
  }
}

export default new ShipperQuoteRequestRepository();
