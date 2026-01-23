import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import threadRepository from '../../../database/repositories/thread.repository';
import { validateRequest, paginationSchema } from '../../../utils/validation';
import { ApiResponse, ThreadType, Priority, Channel, ThreadStatus, CreateThreadRequest } from '../../../types';
import { logger } from '../../../utils/logger';
import { io } from '../../../index';

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
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
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
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
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
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/:id/follow', async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/:id/unfollow', async (req: AuthenticatedRequest, res: Response) => {
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

// POST /api/v1/communications/threads/:id/link-shipment - Link shipment
router.post('/:id/link-shipment', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
router.get('/search', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
