import { db, pool } from '../../config/pg-client';
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

// Base SELECT for threads — joins customers and users via raw SQL
// because pg-client's fluent API doesn't support PostgREST join syntax
const THREAD_SELECT_SQL = `
  SELECT
    t.*,
    json_build_object(
      'id', c.id,
      'name', c.name,
      'email', c.email,
      'phone', c.phone,
      'company', c.company
    ) AS customers,
    CASE WHEN u.id IS NOT NULL THEN
      json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email)
    ELSE NULL END AS users
  FROM communication_threads t
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN users u ON u.id = t.assigned_to
`;

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
    const { page = 1, limit = 100, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    if (page < 1 || limit < 1 || limit > 100) {
      throw new DatabaseError('Invalid pagination parameters');
    }

    try {
      const {
        status, priority, channel, assigned_to, customer_id,
        shipment_id, tags, search, starred, archived, dateFrom, dateTo,
      } = filters;

      const params: any[] = [];
      const conditions: string[] = [];

      const p = () => { params.push(null); return `$${params.length}`; };
      const addParam = (v: any) => { params.push(v); return `$${params.length}`; };

      // Always exclude archived unless explicitly requested
      if (archived !== undefined) {
        conditions.push(`t.archived = ${addParam(archived)}`);
      } else {
        conditions.push(`t.archived = false`);
      }

      if (status?.length) conditions.push(`t.status = ANY(${addParam(status)})`);
      if (priority?.length) conditions.push(`t.priority = ANY(${addParam(priority)})`);
      if (channel?.length) conditions.push(`t.channels && ${addParam(channel)}`);
      if (assigned_to) conditions.push(`t.assigned_to = ${addParam(assigned_to)}`);
      if (customer_id) conditions.push(`t.customer_id = ${addParam(customer_id)}`);
      if (shipment_id) conditions.push(`t.shipment_id = ${addParam(shipment_id)}`);
      if (tags?.length) conditions.push(`t.tags && ${addParam(tags)}`);
      if (starred !== undefined) conditions.push(`t.starred = ${addParam(starred)}`);
      if (dateFrom) conditions.push(`t.created_at >= ${addParam(dateFrom.toISOString())}`);
      if (dateTo) conditions.push(`t.created_at <= ${addParam(dateTo.toISOString())}`);
      if (search) {
        const s = search.replace(/[%_]/g, '\\$&');
        conditions.push(`(t.reference ILIKE ${addParam(`%${s}%`)} OR t.type::text ILIKE ${addParam(`%${s}%`)})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const allowedSortCols = new Set(['created_at', 'updated_at', 'last_message_at', 'priority', 'status']);
      const sortCol = allowedSortCols.has(sortBy) ? sortBy : 'created_at';
      const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
      const offset = (page - 1) * limit;

      const [dataResult, countResult] = await Promise.all([
        pool.query(
          `${THREAD_SELECT_SQL} ${whereClause} ORDER BY t."${sortCol}" ${sortDir} LIMIT ${limit} OFFSET ${offset}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*) FROM communication_threads t ${whereClause}`,
          params
        ),
      ]);

      const total = parseInt(countResult.rows[0].count, 10);

      return {
        threads: dataResult.rows as CommunicationThread[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error: any) {
      if (error instanceof DatabaseError) throw error;
      if (this.isTableMissingError(error)) {
        logger.debug('Communication threads table not found - returning empty array');
        return { threads: [], total: 0, page, limit, totalPages: 0 };
      }
      logger.error('Unexpected error in findAll', { error: error.message });
      throw new DatabaseError('Failed to fetch threads');
    }
  }

  async findById(id: string): Promise<CommunicationThread> {
    if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
      throw new ErrorNotFound('Thread');
    }

    try {
      const result = await pool.query(
        `${THREAD_SELECT_SQL} WHERE t.id = $1 LIMIT 1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new ErrorNotFound('Thread');
      }

      return result.rows[0] as CommunicationThread;
    } catch (error: any) {
      if (error instanceof ErrorNotFound) throw error;
      if (this.isTableMissingError(error)) throw new ErrorNotFound('Thread');
      logger.error('Error fetching thread by id', { threadId: id, error: error.message });
      throw new DatabaseError('Failed to fetch thread');
    }
  }

  async findByReference(reference: string): Promise<CommunicationThread | null> {
    const { data, error } = await db
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

      const { data, error } = await db
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

      const { data, error } = await db
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

      const { error } = await db
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
