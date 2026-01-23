import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { logger } from '../utils/logger';

/**
 * Development Authentication Bypass Middleware
 *
 * This middleware allows testing API endpoints without proper authentication
 * during local development. It creates a mock user for all requests.
 *
 * ⚠️ WARNING: This should ONLY be used in development environment!
 * Never enable this in production!
 */
export function devAuthBypass(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Only allow in development environment
  if (process.env.NODE_ENV !== 'development') {
    logger.error('Attempted to use dev auth bypass in non-development environment');
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Development auth bypass is only available in development mode',
      },
    });
    return;
  }

  // Check if Authorization header is present
  const authHeader = req.headers.authorization;

  // If dev-bypass token is provided, use it
  if (authHeader && authHeader === 'Bearer dev-bypass-token') {
    logger.debug('Using development auth bypass with dev-bypass-token');

    // Attach mock test user to request
    req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'test@banxway.com',
      role: 'admin',
      full_name: 'Test User (Dev Bypass)',
    };

    next();
    return;
  }

  // If no auth header or different token, also allow with mock user
  // This makes it easier for frontend development
  logger.debug('No auth header found, using development auth bypass');

  req.user = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@banxway.com',
    role: 'admin',
    full_name: 'Test User (Dev Bypass)',
  };

  next();
}

/**
 * Conditional authentication middleware
 * Uses dev bypass in development, real auth in production
 */
export function conditionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (process.env.NODE_ENV === 'development') {
    devAuthBypass(req, res, next);
  } else {
    // In production, require real authentication
    // Import and use the real auth middleware
    const { authenticateRequest } = require('./auth.middleware');
    authenticateRequest(req, res, next);
  }
}
