import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import notificationRepository from '../../../database/repositories/notification.repository';
import { logger } from '../../../utils/logger';

const router = Router();
router.use(authenticateRequest);

/**
 * GET /api/v1/notifications
 * Get notifications for the authenticated user
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Query parameters
    const includeRead = req.query.includeRead === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    // Fetch notifications
    const notifications = await notificationRepository.findByUserId(userId, {
      includeRead,
      limit,
    });

    // Get unread count
    const unreadCount = await notificationRepository.getUnreadCount(userId);

    res.json({
      success: true,
      data: notifications,
      count: notifications.length,
      unreadCount,
    });
  } catch (error: any) {
    logger.error('Error fetching notifications', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
    });
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Verify notification belongs to user
    const notification = await notificationRepository.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    if (notification.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this notification',
      });
    }

    // Mark as read
    const updatedNotification = await notificationRepository.markAsRead(notificationId);

    res.json({
      success: true,
      data: updatedNotification,
    });
  } catch (error: any) {
    logger.error('Error marking notification as read', {
      userId: req.user?.id,
      notificationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
    });
  }
});

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for the authenticated user
 */
router.post('/read-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Mark all as read
    const count = await notificationRepository.markAllAsRead(userId);

    res.json({
      success: true,
      message: `Marked ${count} notifications as read`,
      count,
    });
  } catch (error: any) {
    logger.error('Error marking all notifications as read', {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
    });
  }
});

/**
 * DELETE /api/v1/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Verify notification belongs to user
    const notification = await notificationRepository.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    if (notification.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this notification',
      });
    }

    // Delete notification
    await notificationRepository.delete(notificationId);

    res.status(204).send();
  } catch (error: any) {
    logger.error('Error deleting notification', {
      userId: req.user?.id,
      notificationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
    });
  }
});

export default router;
