import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';

import { corsOptions, getWebSocketCorsOrigins } from './middleware/cors.middleware';
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

// Trust Azure Container Apps proxy (sets correct client IP from X-Forwarded-For)
// Required for rate-limiting and IP-based features to work correctly behind Azure's load balancer
app.set('trust proxy', 1);

// =====================================================
// MIDDLEWARE
// =====================================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : [])],
    }
  } : false,
  crossOriginEmbedderPolicy: NODE_ENV === 'production',
}));

// CORS
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Static files (templates)
const templatesPath = path.join(__dirname, '../public/templates');
app.use('/templates', express.static(templatesPath));

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
    origin: getWebSocketCorsOrigins(),
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
    const { supabaseAdmin: dbCheck } = require('./config/database.config');
    const { error } = await dbCheck.from('users').select('id').limit(1);
    if (error) {
      logger.warn('Database connection test failed', { error: error.message });
    } else {
      logger.info('Database connection successful');
    }

    // Ensure banxwayadmin search_path is 'public, auth' (public first so app queries
    // resolve to public.users correctly). GoTrue's search_path is set separately
    // via its DATABASE_URL connection string parameter (&search_path=auth).
    try {
      const { pool } = require('./config/pg-client');
      const roleResult = await pool.query(`SELECT rolconfig FROM pg_roles WHERE rolname = 'banxwayadmin'`);
      const rolconfig: string[] = roleResult.rows[0]?.rolconfig || [];
      const searchPathEntry = rolconfig.find((c: string) => c.startsWith('search_path='));
      if (searchPathEntry !== 'search_path=public, auth') {
        await pool.query(`ALTER ROLE banxwayadmin SET search_path = public, auth`);
        logger.info('DB fix: search_path for banxwayadmin restored to public, auth', { was: searchPathEntry });
      } else {
        logger.info('DB fix: banxwayadmin search_path already correct');
      }
    } catch (dbFixErr: any) {
      logger.warn('DB search_path fix failed', { error: dbFixErr.message });
    }

    // Run migration 013: add crm_customer_id + lead_classification to communication_threads
    try {
      const { pool } = require('./config/pg-client');
      await pool.query(`
        ALTER TABLE communication_threads
          ADD COLUMN IF NOT EXISTS crm_customer_id UUID REFERENCES crm_customers(id),
          ADD COLUMN IF NOT EXISTS lead_classification VARCHAR(30)
            CHECK (lead_classification IN ('new_lead', 'existing_customer', 'existing_shipment', 'unknown')),
          ADD COLUMN IF NOT EXISTS correlation_status VARCHAR(20)
            CHECK (correlation_status IN ('pending', 'matched', 'created', 'failed'))
            DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS correlated_at TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS idx_threads_crm_customer
          ON communication_threads(crm_customer_id) WHERE crm_customer_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_threads_lead_classification
          ON communication_threads(lead_classification) WHERE lead_classification IS NOT NULL;
        ALTER TABLE shipment_requests
          ADD COLUMN IF NOT EXISTS crm_customer_id UUID REFERENCES crm_customers(id);
      `);
      logger.info('Migration 013: correlation engine columns applied');
    } catch (m013Err: any) {
      logger.warn('Migration 013 failed (non-fatal — columns may already exist)', { error: m013Err.message });
    }

    // Disable RLS on CRM tables (RLS with auth.uid() blocks backend service connections
    // because Azure PostgreSQL does not support the Supabase request.jwt.claim.sub GUC)
    try {
      const { pool } = require('./config/pg-client');
      // Check current RLS status
      const rlsCheck = await pool.query(`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('crm_customers', 'crm_contacts', 'customer_interactions', 'customer_documents')
        ORDER BY tablename
      `);
      logger.info('DB fix: CRM RLS status before fix', { tables: rlsCheck.rows });
      // Disable RLS on each table separately
      for (const tbl of ['crm_customers', 'crm_contacts', 'customer_interactions', 'customer_documents']) {
        try {
          await pool.query(`ALTER TABLE IF EXISTS ${tbl} DISABLE ROW LEVEL SECURITY`);
          logger.info(`DB fix: RLS disabled on ${tbl}`);
        } catch (tblErr: any) {
          logger.warn(`DB fix: could not disable RLS on ${tbl}`, { error: tblErr.message });
        }
      }
    } catch (rlsFixErr: any) {
      logger.warn('DB fix: CRM RLS check/disable failed (non-fatal)', { error: rlsFixErr.message });
    }

    // Test Redis connection (non-blocking)
    let redisConnected = false;
    try {
      logger.info('Testing Redis connection...');

      const { getRedisConnection, logRedisConfig } = require('./config/redis.config');
      const redisConfig = logRedisConfig();

      logger.info('Redis configuration', redisConfig);

      // Get Redis connection (lazy initialization happens here)
      const redisConnection = getRedisConnection();

      // Explicitly connect (since we set lazyConnect: true)
      logger.info('Connecting to Redis...');

      // Try to connect, but allow if already connected
      try {
        await redisConnection.connect();
        logger.info('Redis connection initiated');
      } catch (connectError: any) {
        // Allow if already connected/connecting (this can happen if workers loaded first)
        if (connectError.message && connectError.message.includes('already connect')) {
          logger.info('Redis already connected');
        } else {
          throw connectError; // Re-throw other errors
        }
      }

      // Test with ping
      logger.info('Pinging Redis...');
      await Promise.race([
        redisConnection.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 10000))
      ]);
      logger.info('✅ Redis connection successful');
      redisConnected = true;
    } catch (redisError: any) {
      logger.warn('Redis connection failed (non-fatal)', {
        error: redisError.message,
        code: redisError.code,
        errno: redisError.errno,
        syscall: redisError.syscall,
        address: redisError.address,
        port: redisError.port
      });
      logger.warn('Background workers will be disabled');
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Banxway Backend server running on port ${PORT}`);
      logger.info(`📝 Environment: ${NODE_ENV}`);
      logger.info(`🔗 API: http://localhost:${PORT}/api/v1`);
      logger.info(`📡 WebSocket: ws://localhost:${PORT}`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
      logger.info(`📊 Redis: ${redisConnected ? 'Connected' : 'Not connected (workers disabled)'}`);
    });

    // Start background workers only if Redis is connected
    if (redisConnected && process.env.ENABLE_WORKERS !== 'false') {
      logger.info('Starting background workers...');
      require('./workers/email-poller.worker');
      require('./workers/whatsapp-processor.worker');
      require('./workers/sla-checker.worker');

      // Agent pipeline workers (Kafka consumer, document processing, agent result handler)
      if (process.env.ENABLE_AGENT_PIPELINE !== 'false') {
        logger.info('Starting agent pipeline workers...');
        const { createAgentResultWorker } = require('./workers/agent-result.worker');
        createAgentResultWorker();
        require('./workers/document-processor.worker');

        // Kafka consumer only if Kafka is configured
        if (process.env.KAFKA_BOOTSTRAP_SERVERS) {
          require('./workers/kafka-consumer.worker');
          logger.info('Kafka consumer worker started');
        } else {
          logger.info('Kafka consumer skipped (KAFKA_BOOTSTRAP_SERVERS not set)');
        }
        logger.info('Agent pipeline workers started');
      }

      logger.info('Background workers started');
    } else if (!redisConnected) {
      logger.info('Background workers disabled (Redis not available)');
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

  const { getRedisConnection } = require('./config/redis.config');
  const redisConnection = getRedisConnection();
  await redisConnection.quit();
  logger.info('Redis connection closed');

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  const { getRedisConnection } = require('./config/redis.config');
  const redisConnection = getRedisConnection();
  await redisConnection.quit();
  logger.info('Redis connection closed');

  process.exit(0);
});

// Backfill: get unique senders from uncorrelated threads and queue one
// correlation per sender. The handler's retroactive linking will fan out
// to all threads from that sender — so we only need ~N unique senders,
// not ~3800 individual threads.
async function runBackfillCorrelation(): Promise<void> {
  try {
    const { pool } = require('./config/pg-client');
    const { queueAgentResult } = require('./workers/agent-result.worker');

    // Get 20 unique senders that have uncorrelated threads
    const result = await pool.query(`
      SELECT m.from_address, m.from_name, MIN(t.id) AS thread_id
      FROM communication_messages m
      JOIN communication_threads t ON t.id = m.thread_id
      WHERE t.crm_customer_id IS NULL
        AND t.archived = false
        AND m.direction = 'INBOUND'
        AND m.from_address IS NOT NULL
      GROUP BY m.from_address, m.from_name
      LIMIT 20
    `);

    const rows = result.rows || [];
    if (rows.length === 0) {
      logger.info('Backfill: all senders correlated');
      return;
    }

    logger.info(`Backfill: queuing ${rows.length} unique senders for correlation`);

    for (const row of rows) {
      await queueAgentResult({
        resultType: 'correlation_complete',
        agentId: 'backfill',
        entityId: row.thread_id,
        payload: {
          threadId: row.thread_id,
          fromEmail: row.from_address,
          fromName: row.from_name || '',
        },
      }).catch(() => {});
    }

    // Schedule next batch in 90s
    if (rows.length === 20) {
      setTimeout(runBackfillCorrelation, 90000);
    }
  } catch (err: any) {
    logger.warn('Backfill correlation failed (non-fatal)', { error: err.message });
  }
}

// Start the server
if (require.main === module) {
  startServer();

  // Start backfill 30s after boot so the pool stabilizes first
  setTimeout(runBackfillCorrelation, 30000);
}

export default app;
