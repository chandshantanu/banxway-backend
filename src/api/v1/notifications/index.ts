import { Router } from 'express';
import { authenticateRequest, AuthenticatedRequest } from '../../../middleware/auth.middleware';

const router = Router();
router.use(authenticateRequest);

// Get notifications (all authenticated users can access their own notifications)
router.get('/', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [], message: 'Notifications endpoint - TODO' });
});

// Mark notification as read
router.patch('/:id/read', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Mark notification read endpoint - TODO' });
});

// Mark all notifications as read
router.post('/read-all', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Mark all notifications read endpoint - TODO' });
});

export default router;
