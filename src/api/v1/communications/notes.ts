import { Router, Response } from 'express';
import noteRepository from '../../../database/repositories/note.repository';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../utils/logger';

const router = Router();

/**
 * GET /api/v1/communications/notes?threadId=xxx
 * List notes for a thread
 */
router.get('/', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threadId } = req.query;

    if (!threadId || typeof threadId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'threadId query parameter is required',
      });
    }

    const notes = await noteRepository.findByThreadId(threadId);

    res.json({
      success: true,
      data: notes,
      count: notes.length,
    });
  } catch (error: any) {
    logger.error('Failed to fetch notes', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notes',
    });
  }
});

/**
 * POST /api/v1/communications/notes
 * Create a note
 */
router.post('/', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { thread_id, content, is_pinned } = req.body;

    if (!thread_id || !content) {
      return res.status(400).json({
        success: false,
        error: 'thread_id and content are required',
      });
    }

    const note = await noteRepository.create({ thread_id, content, is_pinned }, req.user!.id);

    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    logger.error('Failed to create note', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create note',
    });
  }
});

/**
 * PATCH /api/v1/communications/notes/:id
 * Update a note
 */
router.patch('/:id', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content, is_pinned } = req.body;

    const note = await noteRepository.update(id, { content, is_pinned });

    res.json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    logger.error('Failed to update note', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update note',
    });
  }
});

/**
 * DELETE /api/v1/communications/notes/:id
 * Delete a note
 */
router.delete('/:id', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await noteRepository.delete(id);

    res.status(204).send();
  } catch (error: any) {
    logger.error('Failed to delete note', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete note',
    });
  }
});

/**
 * POST /api/v1/communications/notes/:id/toggle-pin
 * Toggle note pin status
 */
router.post('/:id/toggle-pin', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const note = await noteRepository.togglePin(id);

    res.json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    logger.error('Failed to toggle pin', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to toggle pin',
    });
  }
});

export default router;
