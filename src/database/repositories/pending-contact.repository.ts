import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface PendingContact {
  id: string;
  email: string;
  name: string | null;
  domain: string | null;
  suggested_entity_type: string;
  suggested_classification: string | null;
  first_seen_thread_id: string | null;
  thread_count: number;
  first_seen_at: string;
  last_seen_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MERGED' | 'SPAM';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_crm_customer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePendingContactRequest {
  email: string;
  name?: string;
  domain?: string;
  suggested_entity_type?: string;
  suggested_classification?: string;
  first_seen_thread_id?: string;
}

class PendingContactRepository {
  private isTableMissingError(error: any): boolean {
    return (
      error?.code === '42P01' ||
      (error?.message?.includes('pending_contacts') && error?.message?.includes('not found'))
    );
  }

  async findAll(
    filters?: { status?: string; domain?: string },
    pagination?: { page: number; limit: number }
  ): Promise<{ data: PendingContact[]; total: number }> {
    let query = supabaseAdmin.from('pending_contacts').select('*', { count: 'exact' });
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.domain) query = query.eq('domain', filters.domain);
    query = query.order('last_seen_at', { ascending: false });
    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      query = query.range(offset, offset + pagination.limit - 1);
    }
    const { data, error, count } = await query;
    if (error) {
      if (this.isTableMissingError(error)) return { data: [], total: 0 };
      logger.error('Error fetching pending contacts', { error: error.message });
      throw error;
    }
    return { data: (data || []) as PendingContact[], total: count || 0 };
  }

  async findByEmail(email: string): Promise<PendingContact | null> {
    const { data, error } = await supabaseAdmin
      .from('pending_contacts')
      .select('*')
      .eq('email', email)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      if (this.isTableMissingError(error)) return null;
      throw error;
    }
    return data as PendingContact;
  }

  async findById(id: string): Promise<PendingContact | null> {
    const { data, error } = await supabaseAdmin
      .from('pending_contacts')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      if (this.isTableMissingError(error)) return null;
      throw error;
    }
    return data as PendingContact;
  }

  async create(contact: CreatePendingContactRequest): Promise<PendingContact> {
    const domain = contact.email.split('@')[1] || null;
    const { data, error } = await supabaseAdmin
      .from('pending_contacts')
      .insert({
        ...contact,
        domain: contact.domain || domain,
        suggested_entity_type: contact.suggested_entity_type || 'CUSTOMER',
      })
      .select()
      .single();
    if (error) {
      logger.error('Error creating pending contact', { error: error.message });
      throw error;
    }
    logger.info('Pending contact created', { id: (data as any).id, email: contact.email });
    return data as PendingContact;
  }

  async incrementThreadCount(email: string): Promise<void> {
    const existing = await this.findByEmail(email);
    if (existing) {
      await supabaseAdmin
        .from('pending_contacts')
        .update({
          thread_count: existing.thread_count + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
  }

  async approve(id: string, userId: string, entityType: string, notes?: string): Promise<PendingContact> {
    const { data, error } = await supabaseAdmin
      .from('pending_contacts')
      .update({
        status: 'APPROVED' as const,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        suggested_entity_type: entityType,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    logger.info('Pending contact approved', { id, entityType });
    return data as PendingContact;
  }

  async reject(id: string, userId: string, reason: string): Promise<PendingContact> {
    const { data, error } = await supabaseAdmin
      .from('pending_contacts')
      .update({
        status: 'REJECTED' as const,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    logger.info('Pending contact rejected', { id, reason });
    return data as PendingContact;
  }

  async markSpam(id: string, userId: string): Promise<void> {
    await supabaseAdmin
      .from('pending_contacts')
      .update({
        status: 'SPAM' as const,
        approved_by: userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  async getPendingCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from('pending_contacts')
      .select('id', { count: 'exact' })
      .eq('status', 'PENDING');
    if (error) {
      if (this.isTableMissingError(error)) return 0;
      return 0;
    }
    return count || 0;
  }

  async linkToCrmCustomer(id: string, crmCustomerId: string): Promise<void> {
    await supabaseAdmin
      .from('pending_contacts')
      .update({
        created_crm_customer_id: crmCustomerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }
}

export default new PendingContactRepository();
