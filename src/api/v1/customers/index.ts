import { Router } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';

const router = Router();
router.use(authenticateRequest);

// Get all customers (all roles can view)
router.get('/', requirePermission(Permission.VIEW_CUSTOMERS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [], message: 'List customers endpoint - TODO' });
});

// Create customer (support and above)
router.post('/', requirePermission(Permission.CREATE_CUSTOMERS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Create customer endpoint - TODO' });
});

// Update customer (support and above)
router.patch('/:id', requirePermission(Permission.UPDATE_CUSTOMERS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Update customer endpoint - TODO' });
});

// Delete customer (manager and admin only)
router.delete('/:id', requirePermission(Permission.DELETE_CUSTOMERS), (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: {}, message: 'Delete customer endpoint - TODO' });
});

export default router;
