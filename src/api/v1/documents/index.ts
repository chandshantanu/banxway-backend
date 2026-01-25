import { Router } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';

const router = Router();
router.use(authenticateRequest);

// Get documents (all roles can view)
router.get('/', requirePermission(Permission.VIEW_DOCUMENTS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [], message: 'List documents endpoint - TODO' });
});

// Upload document (support and above)
router.post('/upload', requirePermission(Permission.UPLOAD_DOCUMENTS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Document upload endpoint - TODO' });
});

// Delete document (validator and above)
router.delete('/:id', requirePermission(Permission.DELETE_DOCUMENTS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Delete document endpoint - TODO' });
});

export default router;
