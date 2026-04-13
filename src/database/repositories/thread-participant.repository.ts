import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface ThreadParticipant {
  id: string;
  thread_id: string;
  crm_customer_id: string | null;
  pending_contact_id: string | null;
  contact_email: string;
  contact_name: string | null;
  role: 'PRIMARY' | 'CC' | 'BCC' | 'FORWARDED' | 'MENTIONED' | 'PARTICIPANT';
  entity_type: string | null;
  created_at: string;
}

export interface AddParticipantRequest {
  thread_id: string;
  contact_email: string;
  contact_name?: string;
  role?: string;
  entity_type?: string;
  crm_customer_id?: string;
  pending_contact_id?: string;
}

class ThreadParticipantRepository {
  private isTableMissingError(error: any): boolean {
    return (
      error?.code === '42P01' ||
      (error?.message?.includes('thread_participants') && error?.message?.includes('not found'))
    );
  }

  async findByThread(threadId: string): Promise<ThreadParticipant[]> {
    const { data, error } = await supabaseAdmin
      .from('thread_participants')
      .select('*')
      .eq('thread_id', threadId)
      .order('role');
    if (error) {
      if (this.isTableMissingError(error)) return [];
      throw error;
    }
    return (data || []) as ThreadParticipant[];
  }

  async findPrimaryForThread(threadId: string): Promise<ThreadParticipant | null> {
    const { data, error } = await supabaseAdmin
      .from('thread_participants')
      .select('*')
      .eq('thread_id', threadId)
      .eq('role', 'PRIMARY')
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      if (this.isTableMissingError(error)) return null;
      throw error;
    }
    return data as ThreadParticipant;
  }

  async addParticipant(participant: AddParticipantRequest): Promise<ThreadParticipant> {
    const { data, error } = await supabaseAdmin
      .from('thread_participants')
      .upsert(
        {
          thread_id: participant.thread_id,
          contact_email: participant.contact_email,
          contact_name: participant.contact_name || null,
          role: participant.role || 'PARTICIPANT',
          entity_type: participant.entity_type || null,
          crm_customer_id: participant.crm_customer_id || null,
          pending_contact_id: participant.pending_contact_id || null,
        },
        { onConflict: 'thread_id,contact_email' }
      )
      .select()
      .single();
    if (error) {
      if (this.isTableMissingError(error)) return participant as unknown as ThreadParticipant;
      logger.error('Error adding thread participant', { error: error.message });
      throw error;
    }
    return data as ThreadParticipant;
  }

  async setPrimary(threadId: string, contactEmail: string): Promise<void> {
    // Demote current primary to PARTICIPANT
    await supabaseAdmin
      .from('thread_participants')
      .update({ role: 'PARTICIPANT' })
      .eq('thread_id', threadId)
      .eq('role', 'PRIMARY');
    // Promote new primary
    await supabaseAdmin
      .from('thread_participants')
      .update({ role: 'PRIMARY' })
      .eq('thread_id', threadId)
      .eq('contact_email', contactEmail);
  }

  async removeParticipant(threadId: string, contactEmail: string): Promise<void> {
    await supabaseAdmin
      .from('thread_participants')
      .delete()
      .eq('thread_id', threadId)
      .eq('contact_email', contactEmail);
  }

  async findThreadsByEmail(contactEmail: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from('thread_participants')
      .select('thread_id')
      .eq('contact_email', contactEmail);
    if (error) {
      if (this.isTableMissingError(error)) return [];
      throw error;
    }
    return (data || []).map((r: any) => r.thread_id);
  }

  async linkToCrmCustomer(contactEmail: string, crmCustomerId: string): Promise<void> {
    await supabaseAdmin
      .from('thread_participants')
      .update({ crm_customer_id: crmCustomerId })
      .eq('contact_email', contactEmail);
  }
}

export default new ThreadParticipantRepository();
