import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database.config';
import { UnauthorizedError, ForbiddenError } from '../types';
import { logger } from '../utils/logger';
import { Permission, hasPermission, UserRole } from '../utils/permissions';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    full_name?: string;
  };
}

export async function authenticateRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid token', { error: error?.message });
      throw new UnauthorizedError('Invalid token');
    }

    // Fetch user details with role
    const { data: userDetails, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userDetails) {
      logger.error('Failed to fetch user details', { userId: user.id, error: userError?.message });
      throw new UnauthorizedError('User not found');
    }

    if (!userDetails.is_active) {
      throw new ForbiddenError('User account is inactive');
    }

    // Attach user to request
    req.user = {
      id: userDetails.id,
      email: userDetails.email,
      role: userDetails.role,
      full_name: userDetails.full_name,
    };

    // Update last_seen_at
    (async () => {
      try {
        await supabase
          .from('users')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userDetails.id);
      } catch (err) {
        logger.error('Failed to update last_seen_at', { error: err });
      }
    })();

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      if (!allowedRoles.includes(req.user.role)) {
        logger.warn('Insufficient permissions', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: allowedRoles,
        });
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Permission-based middleware - checks if user has specific permission
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      // Check if user has at least one of the required permissions
      const hasRequiredPermission = permissions.some(permission =>
        hasPermission(req.user!.role, permission)
      );

      if (!hasRequiredPermission) {
        logger.warn('Insufficient permissions', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredPermissions: permissions,
        });
        throw new ForbiddenError('You do not have permission to perform this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has minimum role level
 */
export function requireMinRole(minRole: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      const roleHierarchy: Record<UserRole, number> = {
        [UserRole.VIEWER]: 1,
        [UserRole.SUPPORT]: 2,
        [UserRole.VALIDATOR]: 3,
        [UserRole.MANAGER]: 4,
        [UserRole.ADMIN]: 5,
      };

      const userRoleLevel = roleHierarchy[req.user.role as UserRole] || 0;
      const minRoleLevel = roleHierarchy[minRole];

      if (userRoleLevel < minRoleLevel) {
        logger.warn('Insufficient role level', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredMinRole: minRole,
        });
        throw new ForbiddenError('Insufficient role permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  authenticateRequest(req, res, (error) => {
    // Continue even if authentication fails
    next();
  });
}
