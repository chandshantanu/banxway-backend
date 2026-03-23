import { Router, Response } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// Communication actions — returns empty until workflow engine is implemented
router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  res.json({ success: true, data: [] });
});

export default router;
