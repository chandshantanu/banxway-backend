import rateLimit from 'express-rate-limit';
import { ApiResponse } from '../types';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'); // Increased for production

export const rateLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
      },
    };
    res.status(429).json(response);
  },
});

export const strictRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10,
  message: 'Too many requests, please slow down.',
});

export const authRateLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
});

// Polling rate limiter for presence/notification endpoints
// These endpoints are polled frequently by frontend and need higher limits
// Calculation: ~67.5 requests per user per 15 min (notifications:30, online:30, heartbeat:7.5)
// Setting to 2000 allows for ~30 concurrent users or many browser tabs
export const pollingRateLimiter = rateLimit({
  windowMs: windowMs, // Use same window as global (15 minutes)
  max: parseInt(process.env.POLLING_RATE_LIMIT_MAX || '2000'), // Increased for production
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
      },
    };
    res.status(429).json(response);
  },
});
