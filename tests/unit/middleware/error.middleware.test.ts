/**
 * Error Middleware Unit Tests
 *
 * Tests for the global error handler middleware.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// Mock logger before importing the middleware
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Mock Sentry so it doesn't attempt real network calls
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

import {
  errorHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '../../../src/middleware/error.middleware';

/**
 * Build a minimal Express-like mock for req, res, next
 */
function buildMocks(): {
  req: Partial<Request>;
  res: Partial<Response> & { statusCode: number; body: any };
  next: NextFunction;
} {
  const body: any = {};
  const res: any = {
    statusCode: 200,
    body: null,
  };
  res.status = jest.fn().mockImplementation((code: unknown) => {
    res.statusCode = code as number;
    return res;
  });
  res.json = jest.fn().mockImplementation((data: unknown) => {
    res.body = data;
    return res;
  });

  const req: Partial<Request> = {
    path: '/api/v1/test',
    method: 'GET',
  };

  const next: NextFunction = jest.fn() as any;

  return { req, res, next };
}

describe('errorHandler middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure SENTRY_DSN is unset so Sentry is not invoked in tests
    delete process.env.SENTRY_DSN;
  });

  describe('generic (unhandled) errors', () => {
    it('returns 500 status for a plain Error', () => {
      const { req, res, next } = buildMocks();
      const err = new Error('Something went wrong');

      errorHandler(err, req as Request, res as Response, next);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('includes a safe generic message for unknown errors, not the raw error text', () => {
      const { req, res, next } = buildMocks();
      const err = new Error('raw internal detail that should not leak');

      errorHandler(err, req as Request, res as Response, next);

      expect(res.body.error.message).not.toContain('raw internal detail');
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('logs the error before sending the response', () => {
      const { req, res, next } = buildMocks();
      const err = new Error('Server fault');

      errorHandler(err, req as Request, res as Response, next);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('response includes path and method from the request', () => {
      const { req, res, next } = buildMocks();
      errorHandler(new Error('Oops'), req as Request, res as Response, next);

      expect(res.body.path).toBe('/api/v1/test');
      expect(res.body.method).toBe('GET');
    });

    it('response includes a timestamp string', () => {
      const { req, res, next } = buildMocks();
      errorHandler(new Error('Oops'), req as Request, res as Response, next);

      expect(typeof res.body.timestamp).toBe('string');
      expect(res.body.timestamp.length).toBeGreaterThan(0);
    });
  });

  describe('AppError (operational errors)', () => {
    it('uses the statusCode from AppError', () => {
      const { req, res, next } = buildMocks();
      const err = new AppError('Custom error', 422, 'UNPROCESSABLE');

      errorHandler(err, req as Request, res as Response, next);

      expect(res.statusCode).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE');
      expect(res.body.error.message).toBe('Custom error');
    });

    it('includes details when AppError has them', () => {
      const { req, res, next } = buildMocks();
      const err = new AppError('With details', 400, 'BAD', true, { field: 'name' });

      errorHandler(err, req as Request, res as Response, next);

      expect(res.body.error.details).toEqual({ field: 'name' });
    });
  });

  describe('ValidationError (400)', () => {
    it('returns 400 for ValidationError', () => {
      const { req, res, next } = buildMocks();
      const err = new ValidationError('Name is required');

      errorHandler(err, req as Request, res as Response, next);

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Name is required');
    });

    it('logs ValidationError as warn, not error', () => {
      const { req, res, next } = buildMocks();
      errorHandler(new ValidationError('Bad input'), req as Request, res as Response, next);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('AuthenticationError (401)', () => {
    it('returns 401 for AuthenticationError', () => {
      const { req, res, next } = buildMocks();
      errorHandler(new AuthenticationError(), req as Request, res as Response, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('AuthorizationError (403)', () => {
    it('returns 403 for AuthorizationError', () => {
      const { req, res, next } = buildMocks();
      errorHandler(new AuthorizationError(), req as Request, res as Response, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('NotFoundError (404)', () => {
    it('returns 404 for NotFoundError', () => {
      const { req, res, next } = buildMocks();
      errorHandler(new NotFoundError('Shipment'), req as Request, res as Response, next);

      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('Shipment');
    });
  });

  describe('JWT / auth errors detected by message', () => {
    it('returns 401 when error message includes "jwt"', () => {
      const { req, res, next } = buildMocks();
      const err = new Error('invalid jwt token');

      errorHandler(err, req as Request, res as Response, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('returns 401 when error name is UnauthorizedError', () => {
      const { req, res, next } = buildMocks();
      const err = new Error('Access denied');
      err.name = 'UnauthorizedError';

      errorHandler(err, req as Request, res as Response, next);

      expect(res.statusCode).toBe(401);
    });
  });
});
