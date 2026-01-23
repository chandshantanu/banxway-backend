import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement notifications endpoints
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Notifications endpoint - TODO' });
});

export default router;
