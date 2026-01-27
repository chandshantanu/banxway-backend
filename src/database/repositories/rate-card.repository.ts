/**
 * Rate Card Repository
 *
 * Handles database operations for rate cards (pre-negotiated rates)
 */

import { supabase } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface RateCard {
  id: string;
  rate_card_number: string;
  shipper_id: string;
  rate_type: 'AIR_FREIGHT' | 'SEA_FREIGHT' | 'ODC' | 'BREAK_BULK';
  shipment_type: string;
  origin_airport: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_airport: string | null;
  destination_city: string | null;
  destination_country: string | null;
  commodity_type: string | null;
  min_weight_kg: number | null;
  max_weight_kg: number | null;
  weight_slabs: any; // JSONB
  surcharges: any; // JSONB
  origin_handling_charges: number | null;
  destination_handling_charges: number | null;
  valid_from: string;
  valid_until: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'INACTIVE';
  transit_time_days: number | null;
  free_storage_days: number | null;
  margin_percentage: number | null;
  margin_flat_fee: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateCardWithShipper extends RateCard {
  shipper_name?: string;
  shipper_type?: string;
}

export interface RateCardFilters {
  shipper_id?: string;
  status?: string;
  rate_type?: string;
  shipment_type?: string;
  origin?: string;
  destination?: string;
  valid_on_date?: string;
}

export interface CreateRateCardRequest {
  shipper_id: string;
  rate_type: 'AIR_FREIGHT' | 'SEA_FREIGHT' | 'ODC' | 'BREAK_BULK';
  shipment_type: string;
  origin_airport?: string | null;
  origin_city?: string | null;
  origin_country?: string | null;
  destination_airport?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  commodity_type?: string | null;
  min_weight_kg?: number | null;
  max_weight_kg?: number | null;
  weight_slabs: any; // JSONB
  surcharges?: any; // JSONB
  origin_handling_charges?: number | null;
  destination_handling_charges?: number | null;
  valid_from: string;
  valid_until: string;
  transit_time_days?: number | null;
  free_storage_days?: number | null;
  margin_percentage?: number | null;
  margin_flat_fee?: number | null;
  notes?: string | null;
}

export interface UpdateRateCardRequest {
  rate_type?: 'AIR_FREIGHT' | 'SEA_FREIGHT' | 'ODC' | 'BREAK_BULK';
  shipment_type?: string;
  origin_airport?: string | null;
  origin_city?: string | null;
  origin_country?: string | null;
  destination_airport?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  commodity_type?: string | null;
  min_weight_kg?: number | null;
  max_weight_kg?: number | null;
  weight_slabs?: any; // JSONB
  surcharges?: any; // JSONB
  origin_handling_charges?: number | null;
  destination_handling_charges?: number | null;
  valid_from?: string;
  valid_until?: string;
  status?: 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'INACTIVE';
  transit_time_days?: number | null;
  free_storage_days?: number | null;
  margin_percentage?: number | null;
  margin_flat_fee?: number | null;
  notes?: string | null;
}

class RateCardRepository {
  /**
   * Check if table exists
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('rate_cards') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all rate cards with optional filters
   */
  async findAll(filters?: RateCardFilters): Promise<RateCardWithShipper[]> {
    let query = supabase
      .from('rate_cards')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.shipper_id) {
      query = query.eq('shipper_id', filters.shipper_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.rate_type) {
      query = query.eq('rate_type', filters.rate_type);
    }

    if (filters?.shipment_type) {
      query = query.eq('shipment_type', filters.shipment_type);
    }

    if (filters?.origin) {
      query = query.or(
        `origin_airport.ilike.%${filters.origin}%,origin_city.ilike.%${filters.origin}%`
      );
    }

    if (filters?.destination) {
      query = query.or(
        `destination_airport.ilike.%${filters.destination}%,destination_city.ilike.%${filters.destination}%`
      );
    }

    if (filters?.valid_on_date) {
      query = query
        .lte('valid_from', filters.valid_on_date)
        .gte('valid_until', filters.valid_on_date);
    }

    const { data, error } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Rate cards table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching rate cards', { error: error.message });
      throw error;
    }

    // Flatten shipper data
    return (data as any[]).map((rc) => ({
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shippers: undefined,
    }));
  }

  /**
   * Find rate card by ID
   */
  async findById(id: string): Promise<RateCardWithShipper | null> {
    const { data, error } = await supabase
      .from('rate_cards')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type,
          shipper_code
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Rate cards table not found - returning null');
        return null;
      }

      logger.error('Error fetching rate card', { id, error: error.message });
      throw error;
    }

    // Flatten shipper data
    const rc = data as any;
    return {
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shipper_code: rc.shippers?.shipper_code,
      shippers: undefined,
    };
  }

  /**
   * Find active rate cards
   */
  async findActive(): Promise<RateCardWithShipper[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('rate_cards')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type
        )
      `)
      .eq('status', 'ACTIVE')
      .lte('valid_from', today)
      .gte('valid_until', today)
      .order('created_at', { ascending: false });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Rate cards table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching active rate cards', { error: error.message });
      throw error;
    }

    return (data as any[]).map((rc) => ({
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shippers: undefined,
    }));
  }

  /**
   * Find rate cards by route
   */
  async findByRoute(
    origin: string,
    destination: string,
    date?: string
  ): Promise<RateCardWithShipper[]> {
    const validDate = date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('rate_cards')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type
        )
      `)
      .eq('status', 'ACTIVE')
      .ilike('origin_airport', `%${origin}%`)
      .ilike('destination_airport', `%${destination}%`)
      .lte('valid_from', validDate)
      .gte('valid_until', validDate)
      .order('margin_percentage', { ascending: true }); // Best rates first

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Rate cards table not found - returning empty array');
        return [];
      }

      logger.error('Error finding rate cards by route', {
        origin,
        destination,
        error: error.message,
      });
      throw error;
    }

    return (data as any[]).map((rc) => ({
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shippers: undefined,
    }));
  }

  /**
   * Find expiring rate cards (expiring within N days)
   */
  async findExpiringSoon(days: number = 30): Promise<RateCardWithShipper[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    const { data, error } = await supabase
      .from('rate_cards')
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type
        )
      `)
      .eq('status', 'ACTIVE')
      .gte('valid_until', today.toISOString().split('T')[0])
      .lte('valid_until', futureDate.toISOString().split('T')[0])
      .order('valid_until', { ascending: true });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Rate cards table not found - returning empty array');
        return [];
      }

      logger.error('Error finding expiring rate cards', { error: error.message });
      throw error;
    }

    return (data as any[]).map((rc) => ({
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shippers: undefined,
    }));
  }

  /**
   * Create new rate card
   */
  async create(data: CreateRateCardRequest): Promise<RateCardWithShipper> {
    // Generate rate card number
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const rate_card_number = `RC-${data.rate_type.substring(0, 3)}-${dateStr}-${randomSuffix}`;

    const { data: result, error } = await supabase
      .from('rate_cards')
      .insert({
        ...data,
        rate_card_number,
        status: 'ACTIVE',
      })
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type
        )
      `)
      .single();

    if (error) {
      logger.error('Error creating rate card', { error: error.message });
      throw error;
    }

    logger.info('Rate card created', { id: result.id, rate_card_number });

    const rc = result as any;
    return {
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shippers: undefined,
    };
  }

  /**
   * Update rate card
   */
  async update(id: string, updates: UpdateRateCardRequest): Promise<RateCardWithShipper> {
    const { data, error } = await supabase
      .from('rate_cards')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        shippers!inner (
          shipper_name,
          shipper_type
        )
      `)
      .single();

    if (error) {
      logger.error('Error updating rate card', { id, error: error.message });
      throw error;
    }

    logger.info('Rate card updated', { id });

    const rc = data as any;
    return {
      ...rc,
      shipper_name: rc.shippers?.shipper_name,
      shipper_type: rc.shippers?.shipper_type,
      shippers: undefined,
    };
  }

  /**
   * Delete rate card (soft delete - set status to INACTIVE)
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('rate_cards')
      .update({ status: 'INACTIVE', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('Error deleting rate card', { id, error: error.message });
      throw error;
    }

    logger.info('Rate card deleted (soft)', { id });
  }

  /**
   * Activate rate card
   */
  async activate(id: string): Promise<RateCardWithShipper> {
    return this.update(id, { status: 'ACTIVE' });
  }

  /**
   * Deactivate rate card
   */
  async deactivate(id: string): Promise<RateCardWithShipper> {
    return this.update(id, { status: 'INACTIVE' });
  }
}

export default new RateCardRepository();
