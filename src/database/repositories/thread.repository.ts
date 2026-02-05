import { supabaseAdmin } from '../../config/database.config';
import {
  CommunicationThread,
  CreateThreadRequest,
  UpdateThreadRequest,
  ThreadFilters,
  PaginationParams,
} from '../../types';
import { generateReference } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import {
  NotFoundError as ErrorNotFound,
  DatabaseError
} from '../../middleware/error.middleware';

// Keep the NotFoundError from types for backward compatibility
import { NotFoundError } from '../../types';

export class ThreadRepository {
  /**
   * Check if error is due to missing table
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' || // PostgreSQL: undefined_table
      error.message?.includes('communication_threads') && error.message?.includes('not found') ||
      error.message?.includes('schema cache') ||
      error.message?.includes('relation') && error.message?.includes('does not exist')
    );
  }

  async findAll(filters: ThreadFilters = {}, pagination: PaginationParams = {}) {
    // Extract pagination parameters outside try block for catch block access
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    try {
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

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        throw new DatabaseError('Invalid pagination parameters');
      }

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
          users (
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
        // Sanitize search input
        const sanitizedSearch = search.replace(/[%_]/g, '\\$&');
        query = query.or(`reference.ilike.%${sanitizedSearch}%,type.ilike.%${sanitizedSearch}%`);
      }

      // Pagination and sorting
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

      const { data, error, count } = await query;

      if (error) {
        // CRITICAL: Return empty data if table doesn't exist (graceful degradation)
        if (this.isTableMissingError(error)) {
          logger.debug('Communication threads table not found - returning empty array', {
            error: { code: error.code, message: error.message }
          });
          return {
            threads: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          };
        }

        logger.error('Database error fetching threads', {
          error: { message: error.message, code: error.code }
        });
        throw new DatabaseError('Failed to fetch threads');
      }

      return {
        threads: data as CommunicationThread[],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      };
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }

      // Check for table missing error in catch block too
      if (this.isTableMissingError(error)) {
        logger.debug('Communication threads table not found - returning empty array');
        return {
          threads: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      logger.error('Unexpected error in findAll', {
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to fetch threads');
    }
  }

  async findById(id: string): Promise<CommunicationThread> {
    try {
      // Validate UUID format
      if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
        throw new ErrorNotFound('Thread');
      }

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
          users (
            id,
            full_name,
            email
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found error from PostgREST
          throw new ErrorNotFound('Thread');
        }

        // CRITICAL: Return null if table doesn't exist (graceful degradation)
        if (this.isTableMissingError(error)) {
          logger.debug('Communication threads table not found - returning null', {
            threadId: id
          });
          throw new ErrorNotFound('Thread');
        }

        logger.error('Database error fetching thread', {
          threadId: id,
          error: { message: error.message, code: error.code }
        });
        throw new DatabaseError('Failed to fetch thread');
      }

      if (!data) {
        throw new ErrorNotFound('Thread');
      }

      return data as CommunicationThread;
    } catch (error) {
      if (error instanceof ErrorNotFound || error instanceof DatabaseError) {
        throw error;
      }

      // Check for table missing error in catch block
      if (this.isTableMissingError(error)) {
        logger.debug('Communication threads table not found - returning null');
        throw new ErrorNotFound('Thread');
      }

      logger.error('Unexpected error in findById', {
        threadId: id,
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to fetch thread');
    }
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
    try {
      // Validate required fields
      if (!threadData.customer_id || !threadData.primary_channel) {
        throw new DatabaseError('Missing required fields for thread creation');
      }

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
        logger.error('Database error creating thread', {
          error: { message: error.message, code: error.code }
        });
        throw new DatabaseError('Failed to create thread');
      }

      if (!data) {
        throw new DatabaseError('Failed to create thread - no data returned');
      }

      return data as CommunicationThread;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Unexpected error in create', {
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to create thread');
    }
  }

  async update(id: string, updates: UpdateThreadRequest): Promise<CommunicationThread> {
    try {
      // Validate UUID format
      if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
        throw new ErrorNotFound('Thread');
      }

      // Validate updates object
      if (!updates || Object.keys(updates).length === 0) {
        throw new DatabaseError('No updates provided');
      }

      const { data, error } = await supabaseAdmin
        .from('communication_threads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found error from PostgREST
          throw new ErrorNotFound('Thread');
        }
        logger.error('Database error updating thread', {
          threadId: id,
          error: { message: error.message, code: error.code }
        });
        throw new DatabaseError('Failed to update thread');
      }

      if (!data) {
        throw new ErrorNotFound('Thread');
      }

      return data as CommunicationThread;
    } catch (error) {
      if (error instanceof ErrorNotFound || error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Unexpected error in update', {
        threadId: id,
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to update thread');
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // Validate UUID format
      if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
        throw new ErrorNotFound('Thread');
      }

      const { error } = await supabaseAdmin
        .from('communication_threads')
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === 'PGRST116') {
          throw new ErrorNotFound('Thread');
        }
        logger.error('Database error deleting thread', {
          threadId: id,
          error: { message: error.message, code: error.code }
        });
        throw new DatabaseError('Failed to delete thread');
      }
    } catch (error) {
      if (error instanceof ErrorNotFound || error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Unexpected error in delete', {
        threadId: id,
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to delete thread');
    }
  }

  async addFollower(threadId: string, userId: string): Promise<void> {
    try {
      const thread = await this.findById(threadId);
      const followers = [...(thread.followers || []), userId];

      // Avoid duplicates
      const uniqueFollowers = Array.from(new Set(followers));

      await this.update(threadId, { followers: uniqueFollowers });
    } catch (error) {
      if (error instanceof ErrorNotFound || error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Unexpected error in addFollower', {
        threadId,
        userId,
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to add follower');
    }
  }

  async removeFollower(threadId: string, userId: string): Promise<void> {
    try {
      const thread = await this.findById(threadId);
      const followers = (thread.followers || []).filter(id => id !== userId);

      await this.update(threadId, { followers });
    } catch (error) {
      if (error instanceof ErrorNotFound || error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Unexpected error in removeFollower', {
        threadId,
        userId,
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to remove follower');
    }
  }

  async linkShipment(threadId: string, shipmentId: string): Promise<void> {
    try {
      // Validate shipment ID format
      if (!shipmentId || !shipmentId.match(/^[0-9a-fA-F-]{36}$/)) {
        throw new DatabaseError('Invalid shipment ID format');
      }

      await this.update(threadId, { shipment_id: shipmentId });
    } catch (error) {
      if (error instanceof ErrorNotFound || error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Unexpected error in linkShipment', {
        threadId,
        shipmentId,
        error: { message: (error as Error).message }
      });
      throw new DatabaseError('Failed to link shipment');
    }
  }
}

export default new ThreadRepository();
