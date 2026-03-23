import { Router } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { Permission } from '../../utils/permissions';
import { Response } from 'express';

const router = Router();

// Debug endpoint — admin-only, only enabled in non-production environments
router.get('/env', authenticateRequest, requirePermission(Permission.MANAGE_SETTINGS), (req: AuthenticatedRequest, res: Response): void => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }

  const redisUrl = process.env.REDIS_URL || 'NOT SET';
  const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':****@');

  res.json({
    success: true,
    data: {
      redis: {
        url: maskedUrl,
        hasEnvVar: !!process.env.REDIS_URL,
        isLocalhost: redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1'),
        usesSSL: redisUrl.startsWith('rediss://'),
      },
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  });
});

export default router;
