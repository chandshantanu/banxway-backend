import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement customers endpoints
router.get('/', (req, res) => {
  res.json({ success: true, data: [], message: 'Customers endpoint - TODO' });
});

export default router;
