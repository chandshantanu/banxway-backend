// Vercel serverless function entry point
// Import Express app without starting the server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { corsOptions } from '../src/middleware/cors.middleware';
import { requestLogger } from '../src/middleware/logger.middleware';
import { errorHandler, notFoundHandler } from '../src/middleware/error.middleware';
import apiV1Router from '../src/api/v1';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Custom request logger
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    platform: 'vercel-serverless'
  });
});

// API v1 routes
app.use('/api/v1', apiV1Router);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
