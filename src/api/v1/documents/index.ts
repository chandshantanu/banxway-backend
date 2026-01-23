import { Router } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// TODO: Implement documents endpoints
router.post('/upload', (req, res) => {
  res.json({ success: true, data: {}, message: 'Document upload endpoint - TODO' });
});

export default router;
