import { supabaseAdmin } from '../../config/database.config';
import {
  CommunicationThread,
  CreateThreadRequest,
  UpdateThreadRequest,
  ThreadFilters,
  PaginationParams,
  NotFoundError,
} from '../../types';
import { generateReference } from '../../utils/helpers';
import { logger } from '../../utils/logger';

export class ThreadRepository {
  async findAll(filters: ThreadFilters = {}, pagination: PaginationParams = {}) {
    const {
      status,
      priority,
      channel,
      assigned_to,
      customer_id,
      shipment_id,
      tags,
      search,
      starred,
      archived,
      dateFrom,
      dateTo,
    } = filters;

    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = supabaseAdmin
      .from('communication_threads')
      .select(`
        *,
        customers (
          id,
          name,
          email,
          phone,
          company
        ),
        users!communication_threads_assigned_to_fkey (
          id,
          full_name,
          email
        )
      `, { count: 'exact' });

    // Apply filters
    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (priority && priority.length > 0) {
      query = query.in('priority', priority);
    }

    if (channel && channel.length > 0) {
      query = query.contains('channels', channel);
    }

    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }

    if (customer_id) {
      query = query.eq('customer_id', customer_id);
    }

    if (shipment_id) {
      query = query.eq('shipment_id', shipment_id);
    }

    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }

    if (starred !== undefined) {
      query = query.eq('starred', starred);
    }

    if (archived !== undefined) {
      query = query.eq('archived', archived);
    } else {
      // Default: exclude archived
      query = query.eq('archived', false);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo.toISOString());
    }

    if (search) {
      query = query.or(`reference.ilike.%${search}%,type.ilike.%${search}%`);
    }

    // Pagination and sorting
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Error fetching threads', { error: error.message });
      throw error;
    }

    return {
      threads: data as CommunicationThread[],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  async findById(id: string): Promise<CommunicationThread> {
    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .select(`
        *,
        customers (
          id,
          name,
          email,
          phone,
          company
        ),
        users!communication_threads_assigned_to_fkey (
          id,
          full_name,
          email
        ),
        communication_messages (
          id,
          direction,
          channel,
          content,
          subject,
          sender_type,
          sender_id,
          recipient_type,
          recipient_id,
          status,
          created_at,
          attachments
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Thread');
    }

    return data as CommunicationThread;
  }

  async findByReference(reference: string): Promise<CommunicationThread | null> {
    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .select('*')
      .eq('reference', reference)
      .single();

    if (error) {
      return null;
    }

    return data as CommunicationThread;
  }

  async create(threadData: CreateThreadRequest, userId: string): Promise<CommunicationThread> {
    const reference = generateReference('BX');

    const newThread = {
      reference,
      type: threadData.type,
      priority: threadData.priority || 'MEDIUM',
      customer_id: threadData.customer_id,
      primary_contact_id: threadData.primary_contact_id,
      primary_channel: threadData.primary_channel,
      channels: [threadData.primary_channel],
      shipment_id: threadData.shipment_id,
      tags: threadData.tags || [],
      // assigned_to: userId, // Temporarily disabled for development until user is created
      assigned_to: null, // Set to null for development
      tat_started_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .insert(newThread)
      .select()
      .single();

    if (error) {
      logger.error('Error creating thread', { error: error.message });
      throw error;
    }

    return data as CommunicationThread;
  }

  async update(id: string, updates: UpdateThreadRequest): Promise<CommunicationThread> {
    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating thread', { id, error: error.message });
      throw error;
    }

    return data as CommunicationThread;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('communication_threads')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting thread', { id, error: error.message });
      throw error;
    }
  }

  async addFollower(threadId: string, userId: string): Promise<void> {
    const thread = await this.findById(threadId);
    const followers = [...(thread.followers || []), userId];

    await this.update(threadId, { followers });
  }

  async removeFollower(threadId: string, userId: string): Promise<void> {
    const thread = await this.findById(threadId);
    const followers = (thread.followers || []).filter(id => id !== userId);

    await this.update(threadId, { followers });
  }

  async linkShipment(threadId: string, shipmentId: string): Promise<void> {
    await this.update(threadId, { shipment_id: shipmentId });
  }
}

export default new ThreadRepository();
