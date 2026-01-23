import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement analytics endpoints
router.get('/dashboard', (req, res) => {
  res.json({ success: true, data: {}, message: 'Analytics dashboard endpoint - TODO' });
});

export default router;
