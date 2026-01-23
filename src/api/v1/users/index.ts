import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement users endpoints
router.get('/me', (req, res) => {
  res.json({ success: true, data: {}, message: 'Current user endpoint - TODO' });
});

export default router;
