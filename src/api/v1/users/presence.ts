import { Router, Response } from 'express';
import { supabase } from '../../../config/database.config';
import { AuthenticatedRequest, authenticateRequest } from '../../../middleware/auth.middleware';
import { pollingRateLimiter } from '../../../middleware/rate-limit.middleware';
import { logger } from '../../../utils/logger';

const router = Router();

// Middleware
router.use(authenticateRequest);
router.use(pollingRateLimiter); // Apply higher rate limit for polling endpoints

/**
 * Get online users (users active in the last 5 minutes)
 */
router.get('/online', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, last_seen_at')
      .gte('last_seen_at', fiveMinutesAgo)
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false });

    if (error) {
      logger.error('Error fetching online users', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch online users',
        },
      });
      return;
    }

    // Transform to presence format
    const onlineUsers = (users || []).map(user => {
      const lastSeenDate = new Date(user.last_seen_at);
      const minutesAgo = Math.floor((Date.now() - lastSeenDate.getTime()) / 60000);

      let status: 'ONLINE' | 'AWAY' | 'BUSY' = 'ONLINE';
      if (minutesAgo > 2) status = 'AWAY';

      return {
        userId: user.id,
        userName: user.full_name || user.email?.split('@')[0] || 'User',
        email: user.email,
        role: user.role,
        status,
        lastSeen: user.last_seen_at,
        avatar: null, // Can be extended to include avatar URLs
        currentAction: null,
        currentRequestId: null,
      };
    });

    logger.info('Fetched online users', { count: onlineUsers.length, userId: req.user?.id });

    res.status(200).json({
      success: true,
      data: onlineUsers,
      meta: {
        total: onlineUsers.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Error in GET /users/presence/online', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

/**
 * Update current user's presence/last_seen
 */
router.post('/heartbeat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
      return;
    }

    const { error } = await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (error) {
      logger.error('Error updating user presence', {
        error: error.message,
        userId: req.user.id,
      });
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to update presence',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        lastSeen: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Error in POST /users/presence/heartbeat', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
