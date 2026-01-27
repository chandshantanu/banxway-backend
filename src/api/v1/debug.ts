import { Router } from 'express';

const router = Router();

// Debug endpoint to check environment variables
router.get('/env', (req, res) => {
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
