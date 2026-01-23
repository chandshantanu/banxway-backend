import { Router } from 'express';
import exotelRouter from './exotel';

const router = Router();

// Exotel webhooks (no auth required - they come from Exotel)
router.use('/exotel', exotelRouter);

// Health check for webhooks
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Webhooks endpoint is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
