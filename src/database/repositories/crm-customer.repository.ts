import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type CrmCustomerStatus = 'LEAD' | 'QUALIFIED' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'BLACKLISTED';
export type KycStatus = 'PENDING' | 'IN_PROGRESS' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
export type CreditTerms = 'ADVANCE' | 'NET_7' | 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60' | 'COD';
export type CustomerTier = 'PREMIUM' | 'STANDARD' | 'BASIC' | 'NEW';

export interface CrmCustomer {
  id: string;
  customer_code: string;
  legal_name: string;
  trading_name: string | null;
  company_type: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  website: string | null;
  billing_address: any | null;
  shipping_address: any | null;
  gst_number: string | null;
  pan_number: string | null;
  iec_number: string | null;
  tan_number: string | null;
  industry: string | null;
  annual_revenue_usd: number | null;
  employee_count: number | null;
  customer_tier: CustomerTier;
  status: CrmCustomerStatus;
  kyc_status: KycStatus;
  credit_terms: CreditTerms;
  credit_limit_usd: number | null;
  outstanding_balance_usd: number;
  account_manager: string | null;
  sales_representative: string | null;
  customer_success_manager: string | null;
  lead_source: string | null;
  lead_notes: string | null;
  tags: string[];
  custom_fields: any;
  internal_notes: string | null;
  espocrm_account_id: string | null;
  quickbooks_id: string | null;
  created_at: string;
  updated_at: string;
  last_interaction_at: string | null;
  converted_to_customer_at: string | null;
  kyc_verified_at: string | null;
}

export interface CrmContact {
  id: string;
  customer_id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  preferred_channel: string | null;
  is_primary: boolean;
  is_decision_maker: boolean;
  can_sign_documents: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  notes: string | null;
  tags: string[];
  espocrm_contact_id: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
}

export interface CreateCrmCustomerRequest {
  legal_name: string;
  trading_name?: string;
  company_type?: string;
  primary_email?: string;
  primary_phone?: string;
  website?: string;
  billing_address?: any;
  shipping_address?: any;
  gst_number?: string;
  pan_number?: string;
  iec_number?: string;
  tan_number?: string;
  industry?: string;
  annual_revenue_usd?: number;
  employee_count?: number;
  customer_tier?: CustomerTier;
  status?: CrmCustomerStatus;
  credit_terms?: CreditTerms;
  credit_limit_usd?: number;
  account_manager?: string;
  sales_representative?: string;
  customer_success_manager?: string;
  lead_source?: string;
  lead_notes?: string;
  tags?: string[];
  custom_fields?: any;
  internal_notes?: string;
}

export interface UpdateCrmCustomerRequest {
  legal_name?: string;
  trading_name?: string;
  company_type?: string;
  primary_email?: string;
  primary_phone?: string;
  website?: string;
  billing_address?: any;
  shipping_address?: any;
  gst_number?: string;
  pan_number?: string;
  iec_number?: string;
  tan_number?: string;
  industry?: string;
  annual_revenue_usd?: number;
  employee_count?: number;
  customer_tier?: CustomerTier;
  status?: CrmCustomerStatus;
  kyc_status?: KycStatus;
  credit_terms?: CreditTerms;
  credit_limit_usd?: number;
  outstanding_balance_usd?: number;
  account_manager?: string;
  sales_representative?: string;
  customer_success_manager?: string;
  lead_source?: string;
  lead_notes?: string;
  tags?: string[];
  custom_fields?: any;
  internal_notes?: string;
  espocrm_account_id?: string;
  quickbooks_id?: string;
  last_interaction_at?: string;
  converted_to_customer_at?: string;
  kyc_verified_at?: string;
}

export interface CreateCrmContactRequest {
  customer_id: string;
  full_name: string;
  designation?: string;
  department?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  whatsapp?: string;
  preferred_channel?: string;
  is_primary?: boolean;
  is_decision_maker?: boolean;
  can_sign_documents?: boolean;
  notes?: string;
  tags?: string[];
}

export interface CrmCustomerFilters {
  status?: CrmCustomerStatus[];
  kyc_status?: KycStatus[];
  customer_tier?: CustomerTier[];
  account_manager?: string;
  lead_source?: string;
  tags?: string[];
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

export class CrmCustomerRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('crm_customers') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all CRM customers with filters and pagination
   */
  async findAll(
    filters: CrmCustomerFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    customers: CrmCustomer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { status, kyc_status, customer_tier, account_manager, lead_source, tags, search } = filters;

    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = supabaseAdmin.from('crm_customers').select('*', { count: 'exact' });

    // Apply filters
    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (kyc_status && kyc_status.length > 0) {
      query = query.in('kyc_status', kyc_status);
    }

    if (customer_tier && customer_tier.length > 0) {
      query = query.in('customer_tier', customer_tier);
    }

    if (account_manager) {
      query = query.eq('account_manager', account_manager);
    }

    if (lead_source) {
      query = query.eq('lead_source', lead_source);
    }

    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }

    if (search) {
      query = query.or(
        `customer_code.ilike.%${search}%,legal_name.ilike.%${search}%,primary_email.ilike.%${search}%,gst_number.ilike.%${search}%`
      );
    }

    // Pagination and sorting
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('CRM customers table not found - returning empty array');
        return {
          customers: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      logger.error('Error fetching CRM customers', { error: error.message });
      throw error;
    }

    return {
      customers: data as CrmCustomer[],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Find customer by ID
   */
  async findById(id: string): Promise<CrmCustomer | null> {
    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('CRM customers table not found - returning null');
        return null;
      }

      logger.error('Error fetching CRM customer', { id, error: error.message });
      throw error;
    }

    return data as CrmCustomer;
  }

  /**
   * Find customer by customer code
   */
  async findByCustomerCode(customerCode: string): Promise<CrmCustomer | null> {
    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .select('*')
      .eq('customer_code', customerCode)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('CRM customers table not found - returning null');
        return null;
      }

      logger.error('Error fetching customer by code', { customerCode, error: error.message });
      throw error;
    }

    return data as CrmCustomer;
  }

  /**
   * Find customer by email (for deduplication)
   */
  async findByEmail(email: string): Promise<CrmCustomer | null> {
    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .select('*')
      .eq('primary_email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('CRM customers table not found - returning null');
        return null;
      }

      return null; // Email not found is OK
    }

    return data as CrmCustomer;
  }

  /**
   * Find customer by GST number (for deduplication)
   */
  async findByGstNumber(gstNumber: string): Promise<CrmCustomer | null> {
    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .select('*')
      .eq('gst_number', gstNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('CRM customers table not found - returning null');
        return null;
      }

      return null;
    }

    return data as CrmCustomer;
  }

  /**
   * Create new CRM customer
   */
  async create(customerData: CreateCrmCustomerRequest): Promise<CrmCustomer> {
    // Generate customer code using database function
    const { data: customerCode, error: codeError } = await supabaseAdmin.rpc(
      'generate_customer_code'
    );

    if (codeError) {
      logger.error('Error generating customer code', { error: codeError.message });
      throw codeError;
    }

    const newCustomer = {
      ...customerData,
      customer_code: customerCode,
      customer_tier: customerData.customer_tier || 'NEW',
      status: customerData.status || 'LEAD',
      kyc_status: 'PENDING' as const,
      credit_terms: customerData.credit_terms || 'ADVANCE',
      outstanding_balance_usd: 0,
      tags: customerData.tags || [],
      custom_fields: customerData.custom_fields || {},
    };

    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .insert(newCustomer)
      .select()
      .single();

    if (error) {
      logger.error('Error creating CRM customer', { error: error.message });
      throw error;
    }

    logger.info('CRM customer created', { id: data.id, customer_code: data.customer_code });
    return data as CrmCustomer;
  }

  /**
   * Update CRM customer
   */
  async update(id: string, updates: UpdateCrmCustomerRequest): Promise<CrmCustomer> {
    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating CRM customer', { id, error: error.message });
      throw error;
    }

    logger.info('CRM customer updated', { id, status: data.status });
    return data as CrmCustomer;
  }

  /**
   * Delete CRM customer
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('crm_customers').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting CRM customer', { id, error: error.message });
      throw error;
    }

    logger.info('CRM customer deleted', { id });
  }

  /**
   * Convert lead to customer
   */
  async convertLeadToCustomer(id: string, userId?: string): Promise<CrmCustomer> {
    return this.update(id, {
      status: 'ACTIVE',
      converted_to_customer_at: new Date().toISOString(),
    });
  }

  /**
   * Get all contacts across all customers
   */
  async getAllContacts(): Promise<CrmContact[]> {
    const { data, error } = await supabaseAdmin
      .from('crm_contacts')
      .select('*')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('CRM contacts table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching all contacts', { error: error.message });
      throw error;
    }

    return data as CrmContact[];
  }

  /**
   * Get contacts for customer
   */
  async getContacts(customerId: string): Promise<CrmContact[]> {
    const { data, error } = await supabaseAdmin
      .from('crm_contacts')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching customer contacts', { customerId, error: error.message });
      throw error;
    }

    return data as CrmContact[];
  }

  /**
   * Create contact for customer
   */
  async createContact(contactData: CreateCrmContactRequest): Promise<CrmContact> {
    const newContact = {
      ...contactData,
      is_primary: contactData.is_primary || false,
      is_decision_maker: contactData.is_decision_maker || false,
      can_sign_documents: contactData.can_sign_documents || false,
      email_verified: false,
      phone_verified: false,
      tags: contactData.tags || [],
    };

    const { data, error } = await supabaseAdmin
      .from('crm_contacts')
      .insert(newContact)
      .select()
      .single();

    if (error) {
      logger.error('Error creating contact', { error: error.message });
      throw error;
    }

    logger.info('CRM contact created', { id: data.id, customer_id: data.customer_id });
    return data as CrmContact;
  }

  /**
   * Get customers with pending KYC
   */
  async getPendingKyc(): Promise<CrmCustomer[]> {
    const { data, error } = await supabaseAdmin
      .from('crm_customers')
      .select('*')
      .eq('kyc_status', 'PENDING')
      .order('created_at', { ascending: true });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('CRM customers table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching pending KYC customers', { error: error.message });
      throw error;
    }

    return data as CrmCustomer[];
  }
}

export default new CrmCustomerRepository();
