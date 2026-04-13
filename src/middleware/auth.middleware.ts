import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.config';
import { verifyToken, GoTrueJwtPayload } from '../lib/jwt';
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

    // Log authentication attempt
    logger.debug('Authentication attempt', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 10),
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('No auth token provided', {
        path: req.path,
        method: req.method,
        authHeader: authHeader?.substring(0, 20),
      });
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.replace('Bearer ', '');

    // Log token info (first/last 10 chars only for security)
    logger.debug('Token extracted', {
      tokenStart: token.substring(0, 10),
      tokenEnd: token.substring(token.length - 10),
      tokenLength: token.length,
    });

    // Verify JWT locally using shared JWT_SECRET (no HTTP round-trip)
    let payload: GoTrueJwtPayload;
    try {
      payload = verifyToken(token);
    } catch (jwtError: any) {
      logger.warn('JWT verification failed', {
        path: req.path,
        method: req.method,
        error: jwtError.message,
        tokenLength: token.length,
      });
      throw new UnauthorizedError('Invalid token');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedError('Invalid token: missing user ID');
    }

    logger.debug('Token validated successfully', {
      userId,
      userEmail: payload.email,
    });

    // Fetch user details with role (from PostgreSQL directly)
    const { data: userDetails, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !userDetails) {
      const isDbError = userError?.message?.includes('timeout') ||
        userError?.message?.includes('connection') ||
        userError?.message?.includes('ECONNREFUSED') ||
        userError?.code === 'PGRST301' ||
        userError?.code === '08006' ||
        userError?.code === '08001';

      if (isDbError) {
        logger.error('Database error during authentication — NOT an auth failure', {
          userId,
          error: userError?.message,
          errorCode: userError?.code,
        });
        // Return 503 so frontend does NOT auto-logout
        res.status(503).json({
          success: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
          timestamp: new Date().toISOString(),
          path: req.path,
          method: req.method,
        });
        return;
      }

      logger.error('User not found in database', {
        userId,
        error: userError?.message,
        errorCode: userError?.code,
        errorDetails: userError?.details,
      });
      throw new UnauthorizedError('User not found');
    }

    if (!userDetails.is_active) {
      logger.warn('User account is inactive', {
        userId: userDetails.id,
        email: userDetails.email,
      });
      throw new ForbiddenError('User account is inactive');
    }

    // Attach user to request
    req.user = {
      id: userDetails.id,
      email: userDetails.email,
      role: userDetails.role,
      full_name: userDetails.full_name,
    };

    logger.debug('Authentication successful', {
      userId: req.user.id,
      role: req.user.role,
      path: req.path,
    });

    // Update last_seen_at (fire-and-forget via PG)
    supabaseAdmin
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userDetails.id)
      .then(() => {})
      .catch((err: any) => logger.error('Failed to update last_seen_at', { error: err }));

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
