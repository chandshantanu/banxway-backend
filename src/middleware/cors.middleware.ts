import cors from 'cors';
import { logger } from '../utils/logger';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3003')
  .split(',')
  .map(origin => origin.trim());

// Check if origin matches allowed patterns (supports wildcards like *.vercel.app)
const isOriginAllowed = (origin: string): boolean => {
  return allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === origin) return true;

    // Wildcard pattern (e.g., *.vercel.app)
    if (allowed.startsWith('*')) {
      const pattern = allowed.slice(1); // Remove the *
      return origin.endsWith(pattern);
    }

    return false;
  });
};

// Check if origin is a localhost address (for development)
const isLocalhostOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin requests, server-to-server, mobile apps)
    // In production, browsers always send Origin for cross-origin requests,
    // so no-origin requests are either same-origin or non-browser clients
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow only localhost origins
    if (process.env.NODE_ENV === 'development') {
      if (isLocalhostOrigin(origin) || isOriginAllowed(origin)) {
        return callback(null, true);
      }
      logger.warn(`CORS: Blocked non-localhost origin in development: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    }

    // In production, check against allowed origins
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS: Blocked origin ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  maxAge: 86400, // 24 hours
};

// Export allowed origins for WebSocket CORS configuration
export function getWebSocketCorsOrigins(): string[] {
  if (process.env.NODE_ENV === 'development') {
    return ['http://localhost:3003', 'http://localhost:3000', ...allowedOrigins];
  }
  return allowedOrigins;
}
