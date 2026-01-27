import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Quotation {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipment_type: 'AIR_IMPORT' | 'AIR_EXPORT' | 'ODC_IMPORT' | 'ODC_EXPORT' | 'BREAK_BULK_IMPORT' | 'BREAK_BULK_EXPORT' | 'SEA_AIR_THIRD_COUNTRY';
  origin_location: string | null;
  origin_country: string | null;
  destination_location: string | null;
  destination_country: string | null;
  cargo_description: string | null;
  cargo_weight_kg: number | null;
  cargo_volume_cbm: number | null;
  cargo_dimensions: any | null;
  chargeable_weight: number | null;
  service_requirements: any | null;
  total_cost: number;
  currency: string;
  cost_breakdown: any | null;
  valid_from: string;
  valid_until: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
}

export interface CreateQuotationRequest {
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  shipment_type: Quotation['shipment_type'];
  origin_location?: string;
  origin_country?: string;
  destination_location?: string;
  destination_country?: string;
  cargo_description?: string;
  cargo_weight_kg?: number;
  cargo_volume_cbm?: number;
  cargo_dimensions?: any;
  service_requirements?: any;
  total_cost: number;
  currency?: string;
  cost_breakdown?: any;
  valid_from: string;
  valid_until: string;
  notes?: string;
  internal_notes?: string;
  created_by?: string;
}

export interface UpdateQuotationRequest {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  shipment_type?: Quotation['shipment_type'];
  origin_location?: string;
  origin_country?: string;
  destination_location?: string;
  destination_country?: string;
  cargo_description?: string;
  cargo_weight_kg?: number;
  cargo_volume_cbm?: number;
  cargo_dimensions?: any;
  chargeable_weight?: number;
  service_requirements?: any;
  total_cost?: number;
  currency?: string;
  cost_breakdown?: any;
  valid_from?: string;
  valid_until?: string;
  status?: Quotation['status'];
  notes?: string;
  internal_notes?: string;
  approved_by?: string;
  sent_at?: string;
  accepted_at?: string;
  rejected_at?: string;
}

export interface QuotationFilters {
  status?: Quotation['status'][];
  customer_id?: string;
  shipment_type?: Quotation['shipment_type'];
  created_by?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  expired?: boolean;
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

export class QuotationRepository {
  /**
   * Check if quotations table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('quotations') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all quotations with filters and pagination
   */
  async findAll(
    filters: QuotationFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    quotations: Quotation[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      status,
      customer_id,
      shipment_type,
      created_by,
      dateFrom,
      dateTo,
      search,
      expired,
    } = filters;

    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = supabaseAdmin
      .from('quotations')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }

    if (shipment_type) {
      query = query.eq('shipment_type', shipment_type);
    }

    if (created_by) {
      query = query.eq('created_by', created_by);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo.toISOString());
    }

    if (expired !== undefined) {
      if (expired) {
        query = query.lt('valid_until', new Date().toISOString().split('T')[0]);
      } else {
        query = query.gte('valid_until', new Date().toISOString().split('T')[0]);
      }
    }

    if (search) {
      query = query.or(
        `quote_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`
      );
    }

    // Pagination and sorting
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Quotations table not found - returning empty array');
        return {
          quotations: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      logger.error('Error fetching quotations', { error: error.message });
      throw error;
    }

    return {
      quotations: data as Quotation[],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Find quotation by ID
   */
  async findById(id: string): Promise<Quotation | null> {
    const { data, error } = await supabaseAdmin
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Quotations table not found - returning null');
        return null;
      }

      logger.error('Error fetching quotation', { id, error: error.message });
      throw error;
    }

    return data as Quotation;
  }

  /**
   * Find quotation by quote number
   */
  async findByQuoteNumber(quoteNumber: string): Promise<Quotation | null> {
    const { data, error } = await supabaseAdmin
      .from('quotations')
      .select('*')
      .eq('quote_number', quoteNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Quotations table not found - returning null');
        return null;
      }

      logger.error('Error fetching quotation by number', {
        quoteNumber,
        error: error.message,
      });
      throw error;
    }

    return data as Quotation;
  }

  /**
   * Find quotations by customer
   */
  async findByCustomer(customerId: string): Promise<Quotation[]> {
    const { data, error } = await supabaseAdmin
      .from('quotations')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Quotations table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching quotations by customer', {
        customerId,
        error: error.message,
      });
      throw error;
    }

    return data as Quotation[];
  }

  /**
   * Create new quotation
   */
  async create(quotationData: CreateQuotationRequest): Promise<Quotation> {
    // Generate quote number using database function
    const { data: quoteNumber, error: quoteNumError } = await supabaseAdmin.rpc(
      'generate_quote_number'
    );

    if (quoteNumError) {
      logger.error('Error generating quote number', { error: quoteNumError.message });
      throw quoteNumError;
    }

    // Calculate chargeable weight if dimensions provided
    let chargeableWeight = quotationData.cargo_weight_kg || 0;
    if (quotationData.cargo_volume_cbm) {
      const volumetricWeight = quotationData.cargo_volume_cbm * 167; // Standard air freight conversion
      chargeableWeight = Math.max(chargeableWeight, volumetricWeight);
    }

    const newQuotation = {
      ...quotationData,
      quote_number: quoteNumber,
      chargeable_weight: chargeableWeight,
      currency: quotationData.currency || 'USD',
      status: 'DRAFT' as const,
    };

    const { data, error } = await supabaseAdmin
      .from('quotations')
      .insert(newQuotation)
      .select()
      .single();

    if (error) {
      logger.error('Error creating quotation', { error: error.message });
      throw error;
    }

    logger.info('Quotation created', { id: data.id, quote_number: data.quote_number });
    return data as Quotation;
  }

  /**
   * Update quotation
   */
  async update(id: string, updates: UpdateQuotationRequest): Promise<Quotation> {
    // Recalculate chargeable weight if weight or volume changed
    if (updates.cargo_weight_kg || updates.cargo_volume_cbm) {
      const existing = await this.findById(id);
      if (existing) {
        const weight = updates.cargo_weight_kg || existing.cargo_weight_kg || 0;
        const volume = updates.cargo_volume_cbm || existing.cargo_volume_cbm || 0;
        const volumetricWeight = volume * 167;
        updates.chargeable_weight = Math.max(weight, volumetricWeight);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('quotations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating quotation', { id, error: error.message });
      throw error;
    }

    logger.info('Quotation updated', { id, status: data.status });
    return data as Quotation;
  }

  /**
   * Update quotation status
   */
  async updateStatus(
    id: string,
    status: Quotation['status'],
    userId?: string
  ): Promise<Quotation> {
    const updates: UpdateQuotationRequest = { status };

    // Set appropriate timestamps based on status
    const now = new Date().toISOString();
    switch (status) {
      case 'SENT':
        updates.sent_at = now;
        break;
      case 'ACCEPTED':
        updates.accepted_at = now;
        break;
      case 'REJECTED':
        updates.rejected_at = now;
        break;
      case 'CONVERTED':
        updates.accepted_at = updates.accepted_at || now;
        break;
    }

    if (userId && (status === 'SENT' || status === 'ACCEPTED')) {
      updates.approved_by = userId;
    }

    return this.update(id, updates);
  }

  /**
   * Delete quotation
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('quotations').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting quotation', { id, error: error.message });
      throw error;
    }

    logger.info('Quotation deleted', { id });
  }

  /**
   * Get quotations expiring soon (within N days)
   */
  async findExpiringSoon(days: number = 7): Promise<Quotation[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    const { data, error } = await supabaseAdmin
      .from('quotations')
      .select('*')
      .eq('status', 'SENT')
      .gte('valid_until', today.toISOString().split('T')[0])
      .lte('valid_until', futureDate.toISOString().split('T')[0])
      .order('valid_until', { ascending: true });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Quotations table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching expiring quotations', { error: error.message });
      throw error;
    }

    return data as Quotation[];
  }
}

export default new QuotationRepository();
