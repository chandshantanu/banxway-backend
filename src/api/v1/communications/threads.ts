import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requirePermission } from '../../../middleware/auth.middleware';
import threadRepository from '../../../database/repositories/thread.repository';
import { validateRequest, paginationSchema } from '../../../utils/validation';
import { ApiResponse, ThreadType, Priority, Channel, ThreadStatus, CreateThreadRequest } from '../../../types';
import { logger } from '../../../utils/logger';
import { io } from '../../../index';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';

const router = Router();

// Validation schemas
const createThreadSchema = z.object({
  type: z.nativeEnum(ThreadType),
  priority: z.nativeEnum(Priority).optional(),
  customer_id: z.string().uuid(),
  primary_contact_id: z.string().uuid().optional(),
  primary_channel: z.nativeEnum(Channel),
  shipment_id: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

const updateThreadSchema = z.object({
  status: z.nativeEnum(ThreadStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  assigned_to: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  starred: z.boolean().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const threadFiltersSchema = z.object({
  status: z.array(z.nativeEnum(ThreadStatus)).optional(),
  priority: z.array(z.nativeEnum(Priority)).optional(),
  channel: z.array(z.nativeEnum(Channel)).optional(),
  assigned_to: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  shipment_id: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

// GET /api/v1/communications/threads - List threads
router.get('/', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pagination = validateRequest(paginationSchema, req.query);
    const filters = validateRequest(threadFiltersSchema, req.query);

    const result = await threadRepository.findAll(filters, pagination);

    const response: ApiResponse = {
      success: true,
      data: result.threads,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching threads', { error });
    throw error;
  }
});

// POST /api/v1/communications/threads - Create thread
router.post('/', requirePermission(Permission.CREATE_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = validateRequest(createThreadSchema, req.body) as CreateThreadRequest;
    const userId = req.user!.id;

    const thread = await threadRepository.create(data, userId);

    // Emit WebSocket event
    io.emit('thread:new', { thread });

    const response: ApiResponse = {
      success: true,
      data: thread,
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error('Error creating thread', { error });
    throw error;
  }
});

// GET /api/v1/communications/threads/:id - Get thread
router.get('/:id', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const thread = await threadRepository.findById(req.params.id);

    const response: ApiResponse = {
      success: true,
      data: thread,
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching thread', { error, id: req.params.id });
    throw error;
  }
});

// PATCH /api/v1/communications/threads/:id - Update thread
router.patch('/:id', requirePermission(Permission.ASSIGN_THREADS, Permission.CLOSE_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = validateRequest(updateThreadSchema, req.body);
    const thread = await threadRepository.update(req.params.id, updates);

    // Emit WebSocket event
    io.emit('thread:updated', { threadId: thread.id, updates: thread });

    const response: ApiResponse = {
      success: true,
      data: thread,
    };

    res.json(response);
  } catch (error) {
    logger.error('Error updating thread', { error, id: req.params.id });
    throw error;
  }
});

// DELETE /api/v1/communications/threads/:id - Delete (archive) thread
router.delete('/:id', requirePermission(Permission.DELETE_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Soft delete by archiving
    await threadRepository.update(req.params.id, { archived: true });

    const response: ApiResponse = {
      success: true,
      data: { message: 'Thread archived successfully' },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error archiving thread', { error, id: req.params.id });
    throw error;
  }
});

// POST /api/v1/communications/threads/:id/follow - Follow thread
router.post('/:id/follow', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await threadRepository.addFollower(req.params.id, userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Thread followed successfully' },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error following thread', { error, id: req.params.id });
    throw error;
  }
});

// POST /api/v1/communications/threads/:id/unfollow - Unfollow thread
router.post('/:id/unfollow', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await threadRepository.removeFollower(req.params.id, userId);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Thread unfollowed successfully' },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error unfollowing thread', { error, id: req.params.id });
    throw error;
  }
});

// POST /api/v1/communications/threads/:id/messages - Send message to thread
router.post('/:id/messages', requirePermission(Permission.SEND_MESSAGES), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const threadId = req.params.id;
    const { content, sender_type, channel } = req.body;

    if (!content || !sender_type || !channel) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'content, sender_type, and channel are required',
        },
      });
      return;
    }

    // Verify thread exists
    const thread = await threadRepository.findById(threadId);

    // Create message
    const { data: message, error } = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: threadId,
        channel: channel,
        direction: 'OUTBOUND',
        content: content,
        sender_type: sender_type,
        sender_id: req.user!.id,
        from_address: req.user!.email || '',
        to_addresses: [],
        status: 'SENT',
        sent_at: new Date().toISOString(),
        sent_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating message', { error: error.message, threadId });
      throw error;
    }

    // Update thread timestamps
    await threadRepository.update(threadId, {
      last_activity_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    } as any);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('thread:message', {
      threadId,
      message,
    });

    logger.info('Message sent successfully', {
      messageId: message.id,
      threadId,
      channel,
    });

    const response: ApiResponse = {
      success: true,
      data: message,
    };

    res.json(response);
  } catch (error) {
    logger.error('Error sending message', { error, id: req.params.id });
    throw error;
  }
});

// POST /api/v1/communications/threads/:id/link-shipment - Link shipment
router.post('/:id/link-shipment', requirePermission(Permission.ASSIGN_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { shipment_id } = req.body;

    if (!shipment_id) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'shipment_id is required',
        },
      });
      return;
    }

    await threadRepository.linkShipment(req.params.id, shipment_id);

    const response: ApiResponse = {
      success: true,
      data: { message: 'Shipment linked successfully' },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error linking shipment', { error, id: req.params.id });
    throw error;
  }
});

// GET /api/v1/communications/threads/search - Search threads
router.get('/search', requirePermission(Permission.VIEW_THREADS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search query (q) is required',
        },
      });
      return;
    }

    const pagination = validateRequest(paginationSchema, req.query);
    const result = await threadRepository.findAll({ search: q }, pagination);

    const response: ApiResponse = {
      success: true,
      data: result.threads,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error searching threads', { error });
    throw error;
  }
});

export default router;
