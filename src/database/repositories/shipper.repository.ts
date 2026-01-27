/**
 * Shipper Repository
 *
 * Handles database operations for shippers (airlines, GSAs, shipping lines)
 */

import { supabase } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface Shipper {
  id: string;
  shipper_code: string;
  shipper_name: string;
  shipper_type: 'AIRLINE' | 'SHIPPING_LINE' | 'GSA' | 'FREIGHT_FORWARDER';
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  payment_terms: string | null;
  credit_limit: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateShipperRequest {
  shipper_code: string;
  shipper_name: string;
  shipper_type: 'AIRLINE' | 'SHIPPING_LINE' | 'GSA' | 'FREIGHT_FORWARDER';
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  country?: string;
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
}

export interface UpdateShipperRequest {
  shipper_name?: string;
  shipper_type?: 'AIRLINE' | 'SHIPPING_LINE' | 'GSA' | 'FREIGHT_FORWARDER';
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  country?: string;
  payment_terms?: string;
  credit_limit?: number;
  is_active?: boolean;
  notes?: string;
}

export interface ShipperFilters {
  shipper_type?: string;
  is_active?: boolean;
  search?: string;
}

class ShipperRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('shippers') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all shippers with optional filters
   */
  async findAll(filters?: ShipperFilters): Promise<Shipper[]> {
    let query = supabase
      .from('shippers')
      .select('*')
      .order('shipper_name', { ascending: true });

    // Apply filters
    if (filters?.shipper_type) {
      query = query.eq('shipper_type', filters.shipper_type);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters?.search) {
      query = query.or(
        `shipper_name.ilike.%${filters.search}%,shipper_code.ilike.%${filters.search}%,contact_email.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Shippers table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching shippers', { error: error.message });
      throw error;
    }

    return data as Shipper[];
  }

  /**
   * Find shipper by ID
   */
  async findById(id: string): Promise<Shipper | null> {
    const { data, error } = await supabase
      .from('shippers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      if (this.isTableMissingError(error)) {
        logger.debug('Shippers table not found - returning null');
        return null;
      }

      logger.error('Error fetching shipper', { id, error: error.message });
      throw error;
    }

    return data as Shipper;
  }

  /**
   * Find shipper by code
   */
  async findByCode(code: string): Promise<Shipper | null> {
    const { data, error } = await supabase
      .from('shippers')
      .select('*')
      .eq('shipper_code', code)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      if (this.isTableMissingError(error)) {
        logger.debug('Shippers table not found - returning null');
        return null;
      }

      logger.error('Error fetching shipper by code', { code, error: error.message });
      throw error;
    }

    return data as Shipper;
  }

  /**
   * Create new shipper
   */
  async create(data: CreateShipperRequest): Promise<Shipper> {
    const { data: result, error } = await supabase
      .from('shippers')
      .insert({
        ...data,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating shipper', { error: error.message });
      throw error;
    }

    logger.info('Shipper created', { id: result.id, code: result.shipper_code });
    return result as Shipper;
  }

  /**
   * Update shipper
   */
  async update(id: string, updates: UpdateShipperRequest): Promise<Shipper> {
    const { data, error } = await supabase
      .from('shippers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating shipper', { id, error: error.message });
      throw error;
    }

    logger.info('Shipper updated', { id });
    return data as Shipper;
  }

  /**
   * Delete shipper (soft delete - set is_active to false)
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('shippers')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      logger.error('Error deleting shipper', { id, error: error.message });
      throw error;
    }

    logger.info('Shipper deactivated', { id });
  }

  /**
   * Activate shipper
   */
  async activate(id: string): Promise<Shipper> {
    return this.update(id, { is_active: true });
  }

  /**
   * Deactivate shipper
   */
  async deactivate(id: string): Promise<Shipper> {
    return this.update(id, { is_active: false });
  }
}

export default new ShipperRepository();
