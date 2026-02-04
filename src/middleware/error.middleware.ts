import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Standard API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  path: string;
  method: string;
}

/**
 * Application Error with proper categorization
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

/**
 * Authentication Error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR', true);
  }
}

/**
 * Authorization Error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR', true);
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND', true);
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT_ERROR', true);
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR', true);
  }
}

/**
 * Database Error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR', true);
  }
}

/**
 * External Service Error (502)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `External service ${service} is unavailable`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      true
    );
  }
}

/**
 * Clean error object - remove stack traces and sensitive data
 */
function cleanError(error: any): any {
  if (!error || typeof error !== 'object') {
    return error;
  }

  const cleaned: any = {
    message: error.message || 'Unknown error',
  };

  // Only include safe properties
  if (error.code) cleaned.code = error.code;
  if (error.name && error.name !== 'Error') cleaned.name = error.name;
  
  // NEVER include stack traces or sensitive data
  // Delete these explicitly to ensure they never appear
  delete error.stack;
  delete error.stackTrace;

  return cleaned;
}

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): any {
  const formattedErrors: Record<string, string> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    formattedErrors[path] = err.message;
  });

  return {
    fields: formattedErrors,
    message: 'Validation failed',
  };
}

/**
 * Global error handling middleware
 * 
 * IMPORTANT: This middleware ensures NO stack traces are ever sent to clients
 * and logs are kept clean without stack traces
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Default values
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Handle different error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const zodError = formatZodError(err);
    message = zodError.message;
    details = zodError.fields;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'UnauthorizedError' || err.message.includes('jwt')) {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = 'Authentication required';
  } else if (err.message.includes('permission') || err.message.includes('forbidden')) {
    statusCode = 403;
    code = 'AUTHORIZATION_ERROR';
    message = 'Insufficient permissions';
  } else if (err.message.includes('not found') || err.message.includes('does not exist')) {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = err.message;
  } else {
    // Generic error - use safe message
    message = 'An unexpected error occurred. Please try again.';
  }

  // Build clean error response (NO STACK TRACES)
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };

  // Log error with clean format (NO STACK TRACES)
  const logContext = {
    statusCode,
    code,
    method: req.method,
    path: req.path,
    userId: (req as any).user?.id,
    error: cleanError(err), // Clean error object without stack
  };

  if (statusCode >= 500) {
    // Server errors - log as error
    logger.error(message, logContext);
  } else if (statusCode >= 400) {
    // Client errors - log as warning
    logger.warn(message, logContext);
  }

  // Send clean error response to client
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };

  res.status(404).json(errorResponse);
}

/**
 * Async route handler wrapper to catch errors
 * Use this to wrap async route handlers to automatically catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate and sanitize error before sending to client
 */
export function sanitizeErrorForClient(error: any): { code: string; message: string; details?: any } {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    };
  }

  // For unknown errors, return generic message
  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
}
