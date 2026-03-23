import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// Compose suggestions — returns empty until AI compose is implemented
router.post('/suggestions', (req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, data: [] });
});

export default router;
