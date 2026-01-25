import { Router, Response } from 'express';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';
import presenceRouter from './presence';

const router = Router();
router.use(authenticateRequest);

// Presence routes
router.use('/presence', presenceRouter);

// Get current user (all authenticated users can access)
router.get('/me', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Get fresh user data from database
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', req.user?.id)
      .single();

    if (error || !data) {
      res.json({
        success: true,
        data: req.user,
      });
      return;
    }

    // Update last_seen_at
    await supabaseAdmin
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.user?.id);

    res.json({
      success: true,
      data: {
        ...data,
        // Include any auth-level data
        email: req.user?.email || data.email,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching current user', { error: error.message });
    res.json({
      success: true,
      data: req.user,
    });
  }
});

// Get all users (admin and manager only)
router.get('/', requirePermission(Permission.VIEW_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { role, is_active, search, page = '1', limit = '50' } = req.query;

    let query = supabaseAdmin
      .from('users')
      .select('*', { count: 'exact' });

    // Apply filters
    if (role) {
      query = query.eq('role', role);
    }
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Error fetching users', { error });
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
      return;
    }

    // Get assignment counts for each user
    const userIds = data?.map(u => u.id) || [];
    const { data: threadCounts } = await supabaseAdmin
      .from('communication_threads')
      .select('assigned_to')
      .in('assigned_to', userIds)
      .in('status', ['NEW', 'IN_PROGRESS', 'AWAITING_CLIENT', 'AWAITING_INTERNAL']);

    const assignmentMap = new Map<string, number>();
    threadCounts?.forEach(t => {
      const current = assignmentMap.get(t.assigned_to) || 0;
      assignmentMap.set(t.assigned_to, current + 1);
    });

    // Enrich users with stats
    const enrichedUsers = data?.map(user => ({
      ...user,
      stats: {
        activeThreads: assignmentMap.get(user.id) || 0,
      },
    }));

    res.json({
      success: true,
      data: enrichedUsers || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error: any) {
    logger.error('Error in GET /users', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get single user by ID
router.get('/:id', requirePermission(Permission.VIEW_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      throw error;
    }

    // Get user's thread stats
    const { data: threads } = await supabaseAdmin
      .from('communication_threads')
      .select('id, status')
      .eq('assigned_to', id);

    const stats = {
      totalAssigned: threads?.length || 0,
      activeThreads: threads?.filter(t => ['NEW', 'IN_PROGRESS', 'AWAITING_CLIENT', 'AWAITING_INTERNAL'].includes(t.status)).length || 0,
      resolvedThreads: threads?.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length || 0,
    };

    res.json({
      success: true,
      data: {
        ...data,
        stats,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching user', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

// Create user (admin only)
router.post('/', requirePermission(Permission.CREATE_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, full_name, role = 'viewer', preferences } = req.body;

    // Validate required fields
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'validator', 'support', 'viewer'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ success: false, error: 'Invalid role' });
      return;
    }

    // Check if user already exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      res.status(409).json({ success: false, error: 'User with this email already exists' });
      return;
    }

    // Create user in Supabase Auth (this will trigger the user creation in the users table via trigger)
    // For now, we'll create a placeholder that gets linked when the user signs up
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
      },
    });

    if (authError) {
      logger.error('Error creating auth user', { error: authError });
      res.status(500).json({ success: false, error: 'Failed to create user account' });
      return;
    }

    // Insert into users table
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id,
        email,
        full_name,
        role,
        preferences: preferences || {},
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating user record', { error });
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      res.status(500).json({ success: false, error: 'Failed to create user' });
      return;
    }

    logger.info('User created', { userId: data.id, email, role });

    res.status(201).json({
      success: true,
      data,
      message: 'User created. They will receive an email to set their password.',
    });
  } catch (error: any) {
    logger.error('Error in POST /users', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update user (admin only, or self for limited fields)
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const isAdmin = req.user?.role === 'admin';
    const isSelf = req.user?.id === id;

    // Check permissions
    if (!isAdmin && !isSelf) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    // Non-admins can only update certain fields
    if (!isAdmin) {
      const allowedFields = ['full_name', 'preferences'];
      Object.keys(updates).forEach(key => {
        if (!allowedFields.includes(key)) {
          delete updates[key];
        }
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.email;
    delete updates.created_at;

    // Validate role if being updated
    if (updates.role) {
      const validRoles = ['admin', 'manager', 'validator', 'support', 'viewer'];
      if (!validRoles.includes(updates.role)) {
        res.status(400).json({ success: false, error: 'Invalid role' });
        return;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      throw error;
    }

    logger.info('User updated', { userId: id, updates: Object.keys(updates) });

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error updating user', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// Deactivate user (admin only) - soft delete
router.delete('/:id', requirePermission(Permission.DELETE_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user?.id === id) {
      res.status(400).json({ success: false, error: 'Cannot delete your own account' });
      return;
    }

    // Check if user exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Soft delete - deactivate user
    const { error } = await supabaseAdmin
      .from('users')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw error;
    }

    logger.info('User deactivated', { userId: id });

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error: any) {
    logger.error('Error deactivating user', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to deactivate user' });
  }
});

// Reactivate user (admin only)
router.post('/:id/reactivate', requirePermission(Permission.UPDATE_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      throw error;
    }

    logger.info('User reactivated', { userId: id });

    res.json({
      success: true,
      data,
      message: 'User reactivated successfully',
    });
  } catch (error: any) {
    logger.error('Error reactivating user', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to reactivate user' });
  }
});

// Update user role (admin only)
router.patch('/:id/role', requirePermission(Permission.UPDATE_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles = ['admin', 'manager', 'validator', 'support', 'viewer'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ success: false, error: 'Invalid role' });
      return;
    }

    // Prevent changing own role
    if (req.user?.id === id) {
      res.status(400).json({ success: false, error: 'Cannot change your own role' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }
      throw error;
    }

    logger.info('User role updated', { userId: id, newRole: role });

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('Error updating user role', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update user role' });
  }
});

// Get team stats summary
router.get('/stats/summary', requirePermission(Permission.VIEW_USERS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, role, is_active');

    const stats = {
      total: users?.length || 0,
      active: users?.filter(u => u.is_active).length || 0,
      inactive: users?.filter(u => !u.is_active).length || 0,
      byRole: {
        admin: users?.filter(u => u.role === 'admin').length || 0,
        manager: users?.filter(u => u.role === 'manager').length || 0,
        validator: users?.filter(u => u.role === 'validator').length || 0,
        support: users?.filter(u => u.role === 'support').length || 0,
        viewer: users?.filter(u => u.role === 'viewer').length || 0,
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Error fetching user stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch user stats' });
  }
});

export default router;
