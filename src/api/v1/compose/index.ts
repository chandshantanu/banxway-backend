import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement AI compose endpoints
router.post('/suggestions', (req, res) => {
  res.json({ success: true, data: [], message: 'Compose suggestions endpoint - TODO' });
});

export default router;
