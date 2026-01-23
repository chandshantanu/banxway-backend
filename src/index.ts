import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';

import { corsOptions } from './middleware/cors.middleware';
import { rateLimiter } from './middleware/rate-limit.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

import apiV1Router from './api/v1';
import { initializeWebSocket } from './websocket/server';

dotenv.config();

const app: Express = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// =====================================================
// MIDDLEWARE
// =====================================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// HTTP request logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Custom request logger
app.use(requestLogger);

// Rate limiting
app.use('/api/', rateLimiter);

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
  });
});

// API v1 routes
app.use('/api/v1', apiV1Router);

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// =====================================================
// WEBSOCKET SETUP
// =====================================================

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3003',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Initialize WebSocket handlers
initializeWebSocket(io);

// Make io available globally
export { io };

// =====================================================
// SERVER START
// =====================================================

async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const { supabase } = require('./config/database.config');
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      logger.warn('Database connection test failed', { error: error.message });
    } else {
      logger.info('Database connection successful');
    }

    // Test Redis connection
    logger.info('Testing Redis connection...');
    const { redisConnection } = require('./config/redis.config');
    await redisConnection.ping();
    logger.info('Redis connection successful');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Banxway Backend server running on port ${PORT}`);
      logger.info(`📝 Environment: ${NODE_ENV}`);
      logger.info(`🔗 API: http://localhost:${PORT}/api/v1`);
      logger.info(`📡 WebSocket: ws://localhost:${PORT}`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
    });

    // Start background workers
    if (process.env.ENABLE_WORKERS !== 'false') {
      logger.info('Starting background workers...');
      require('./workers/email-poller.worker');
      require('./workers/whatsapp-processor.worker');
      require('./workers/sla-checker.worker');
      logger.info('Background workers started');
    }

  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  const { redisConnection } = require('./config/redis.config');
  await redisConnection.quit();
  logger.info('Redis connection closed');

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  const { redisConnection } = require('./config/redis.config');
  await redisConnection.quit();
  logger.info('Redis connection closed');

  process.exit(0);
});

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
