import { Request, Response, NextFunction } from 'express';
import { ApiError, ApiResponse } from '../types';
import { logger } from '../utils/logger';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract user info if available
  const user = (req as any).user;

  // Log error with comprehensive context
  logger.error('Error occurred', {
    error: {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    },
    request: {
      path: req.path,
      method: req.method,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
      body: process.env.NODE_ENV === 'production' ? undefined : req.body,
      query: req.query,
      params: req.params,
    },
    user: user ? {
      id: user.id,
      email: user.email,
      role: user.role,
    } : undefined,
    timestamp: new Date().toISOString(),
  });

  // Handle ApiError
  if (error instanceof ApiError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };

    res.status(error.statusCode).json(response);
    return;
  }

  // Handle validation errors from libraries
  if (error.name === 'ValidationError') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      },
    };

    res.status(400).json(response);
    return;
  }

  // Handle unexpected errors
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message,
    },
  };

  res.status(500).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  };

  res.status(404).json(response);
}
