import { Router } from 'express';
import exotelRouter from './exotel';
import espoCrmRouter from './espocrm';

const router = Router();

// Exotel webhooks (no auth required - they come from Exotel)
router.use('/exotel', exotelRouter);

// EspoCRM webhooks (secret-based auth)
router.use('/espocrm', espoCrmRouter);

// Health check for webhooks
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Webhooks endpoint is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
