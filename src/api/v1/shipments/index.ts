import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement shipments endpoints
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Shipments endpoint - TODO' });
});

export default router;
