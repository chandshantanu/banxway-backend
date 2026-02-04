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
import { 
  asyncHandler, 
  ValidationError, 
  NotFoundError,
  DatabaseError 
} from '../../../middleware/error.middleware';

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
router.get('/', requirePermission(Permission.VIEW_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pagination = validateRequest(paginationSchema, req.query);
  const filters = validateRequest(threadFiltersSchema, req.query);

  const result = await threadRepository.findAll(filters, pagination);

  if (!result || !result.threads) {
    throw new DatabaseError('Failed to fetch threads');
  }

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
}));

// POST /api/v1/communications/threads - Create thread
router.post('/', requirePermission(Permission.CREATE_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = validateRequest(createThreadSchema, req.body) as CreateThreadRequest;
  
  if (!req.user?.id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = req.user.id;

  const thread = await threadRepository.create(data, userId);

  if (!thread || !thread.id) {
    throw new DatabaseError('Failed to create thread');
  }

  // Emit WebSocket event (only if io is available)
  try {
    if (io) {
      io.emit('thread:new', { thread });
    }
  } catch (wsError) {
    // Log but don't fail the request if WebSocket fails
    logger.warn('Failed to emit WebSocket event', { 
      event: 'thread:new', 
      threadId: thread.id,
      error: { message: (wsError as Error).message }
    });
  }

  const response: ApiResponse = {
    success: true,
    data: thread,
  };

  res.status(201).json(response);
}));

// GET /api/v1/communications/threads/:id - Get thread
router.get('/:id', requirePermission(Permission.VIEW_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }

  const thread = await threadRepository.findById(id);

  if (!thread) {
    throw new NotFoundError('Thread');
  }

  const response: ApiResponse = {
    success: true,
    data: thread,
  };

  res.json(response);
}));

// PATCH /api/v1/communications/threads/:id - Update thread
router.patch('/:id', requirePermission(Permission.ASSIGN_THREADS, Permission.CLOSE_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }
  
  const updates = validateRequest(updateThreadSchema, req.body);
  
  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No updates provided');
  }

  const thread = await threadRepository.update(id, updates);

  if (!thread) {
    throw new NotFoundError('Thread');
  }

  // Emit WebSocket event (only if io is available)
  try {
    if (io) {
      io.emit('thread:updated', { threadId: thread.id, updates: thread });
    }
  } catch (wsError) {
    // Log but don't fail the request if WebSocket fails
    logger.warn('Failed to emit WebSocket event', { 
      event: 'thread:updated', 
      threadId: thread.id,
      error: { message: (wsError as Error).message }
    });
  }

  const response: ApiResponse = {
    success: true,
    data: thread,
  };

  res.json(response);
}));

// DELETE /api/v1/communications/threads/:id - Delete (archive) thread
router.delete('/:id', requirePermission(Permission.DELETE_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }

  // Soft delete by archiving
  const thread = await threadRepository.update(id, { archived: true });

  if (!thread) {
    throw new NotFoundError('Thread');
  }

  const response: ApiResponse = {
    success: true,
    data: { message: 'Thread archived successfully' },
  };

  res.json(response);
}));

// POST /api/v1/communications/threads/:id/follow - Follow thread
router.post('/:id/follow', requirePermission(Permission.VIEW_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }
  
  if (!req.user?.id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = req.user.id;
  await threadRepository.addFollower(id, userId);

  const response: ApiResponse = {
    success: true,
    data: { message: 'Thread followed successfully' },
  };

  res.json(response);
}));

// POST /api/v1/communications/threads/:id/unfollow - Unfollow thread
router.post('/:id/unfollow', requirePermission(Permission.VIEW_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  
  if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }
  
  if (!req.user?.id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = req.user.id;
  await threadRepository.removeFollower(id, userId);

  const response: ApiResponse = {
    success: true,
    data: { message: 'Thread unfollowed successfully' },
  };

  res.json(response);
}));

// POST /api/v1/communications/threads/:id/messages - Send message to thread
router.post('/:id/messages', requirePermission(Permission.SEND_MESSAGES), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const threadId = req.params.id;
  const { content, sender_type, channel } = req.body;

  // Validate thread ID
  if (!threadId || !threadId.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }

  // Validate required fields
  if (!content || !sender_type || !channel) {
    throw new ValidationError('content, sender_type, and channel are required');
  }

  if (!req.user?.id || !req.user?.email) {
    throw new ValidationError('User authentication data is missing');
  }

  // Verify thread exists
  const thread = await threadRepository.findById(threadId);
  if (!thread) {
    throw new NotFoundError('Thread');
  }

  // Create message
  const { data: message, error } = await supabaseAdmin
    .from('communication_messages')
    .insert({
      thread_id: threadId,
      channel: channel,
      direction: 'OUTBOUND',
      content: content,
      sender_type: sender_type,
      sender_id: req.user.id,
      from_address: req.user.email,
      to_addresses: [],
      status: 'SENT',
      sent_at: new Date().toISOString(),
      sent_by: req.user.id,
    })
    .select()
    .single();

  if (error || !message) {
    logger.error('Failed to create message', { 
      threadId,
      error: { message: error?.message, code: error?.code }
    });
    throw new DatabaseError('Failed to create message');
  }

  // Update thread timestamps
  try {
    await threadRepository.update(threadId, {
      last_activity_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    } as any);
  } catch (updateError) {
    // Log but don't fail the request if timestamp update fails
    logger.warn('Failed to update thread timestamps', { 
      threadId,
      error: { message: (updateError as Error).message }
    });
  }

  // Emit WebSocket event (only if io is available)
  try {
    if (io) {
      io.to(`thread:${threadId}`).emit('thread:message', {
        threadId,
        message,
      });
    }
  } catch (wsError) {
    // Log but don't fail the request if WebSocket fails
    logger.warn('Failed to emit WebSocket event', { 
      event: 'thread:message', 
      threadId,
      error: { message: (wsError as Error).message }
    });
  }

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
}));

// POST /api/v1/communications/threads/:id/link-shipment - Link shipment
router.post('/:id/link-shipment', requirePermission(Permission.ASSIGN_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { shipment_id } = req.body;

  if (!id || !id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid thread ID format');
  }

  if (!shipment_id || !shipment_id.match(/^[0-9a-fA-F-]{36}$/)) {
    throw new ValidationError('Invalid shipment ID format');
  }

  await threadRepository.linkShipment(id, shipment_id);

  const response: ApiResponse = {
    success: true,
    data: { message: 'Shipment linked successfully' },
  };

  res.json(response);
}));

// GET /api/v1/communications/threads/search - Search threads
router.get('/search', requirePermission(Permission.VIEW_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Search query (q) is required and must be a non-empty string');
  }

  const pagination = validateRequest(paginationSchema, req.query);
  const result = await threadRepository.findAll({ search: q.trim() }, pagination);

  if (!result || !result.threads) {
    throw new DatabaseError('Failed to search threads');
  }

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
}));

export default router;
