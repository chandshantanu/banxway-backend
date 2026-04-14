import * as appInsights from 'applicationinsights';

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(false)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
    .setSendLiveMetrics(process.env.NODE_ENV === 'production')
    .start();
}

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

    // Migration 018: Create team user accounts (idempotent — ON CONFLICT DO UPDATE)
    try {
      const { pool: dbPool } = require('./config/pg-client');
      await dbPool.query(`
        INSERT INTO users (id, email, full_name, role, is_active, created_at, updated_at) VALUES
        ('0e9901ab-a54d-4caf-bf01-26cf7303d433', 'ceo@banxwayglobal.com', 'Ashish R. Sahay', 'admin', true, NOW(), NOW()),
        ('8835714d-4890-499f-b639-eddd5f2e027c', 'prakash.singh@banxwayglobal.com', 'Prakash Singh', 'manager', true, NOW(), NOW()),
        ('ebeb1363-a28e-421f-a19c-9bc24565ab93', 'sales@banxwayglobal.com', 'Neeta Joshi', 'manager', true, NOW(), NOW()),
        ('342004ae-b2f2-4573-bea9-61817f37a904', 'sr.sales@banxwayglobal.com', 'Nishant Kapoor', 'manager', true, NOW(), NOW()),
        ('8541344b-cdde-49e1-b0f4-b9db937159f0', 'neeraj@banxwayglobal.com', 'Neeraj Kumar', 'admin', true, NOW(), NOW()),
        ('a04fab9d-ef19-4d5c-901e-f89a2e1048fd', 'connect@banxwayglobal.com', 'Banxway Pricing', 'support', true, NOW(), NOW()),
        ('6445b237-dfef-4577-ae29-1b7f5b1c2951', 'import@banxwayglobal.com', 'Vijay Tiwari', 'support', true, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true, updated_at = NOW();
      `);
      logger.info('Migration 018: team user accounts created/updated');
    } catch (m018Err: any) {
      logger.warn('Migration 018 failed (non-fatal)', { error: m018Err.message });
    }

    // Migration 019: Communication backbone — entity types, pipeline stages, pending contacts, thread participants
    try {
      const { pool: dbPool019 } = require('./config/pg-client');
      await dbPool019.query(`
        ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'CUSTOMER';
        CREATE INDEX IF NOT EXISTS idx_crm_customers_entity_type ON crm_customers(entity_type);

        ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50);
        ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
        ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '[]';
        CREATE INDEX IF NOT EXISTS idx_threads_pipeline_stage ON communication_threads(pipeline_stage) WHERE pipeline_stage IS NOT NULL;

        CREATE TABLE IF NOT EXISTS pending_contacts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          domain VARCHAR(255),
          suggested_entity_type VARCHAR(50) DEFAULT 'CUSTOMER',
          suggested_classification VARCHAR(50),
          first_seen_thread_id UUID,
          thread_count INTEGER DEFAULT 1,
          first_seen_at TIMESTAMPTZ DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ DEFAULT NOW(),
          status VARCHAR(50) DEFAULT 'PENDING',
          approved_by UUID,
          approved_at TIMESTAMPTZ,
          rejection_reason TEXT,
          created_crm_customer_id UUID,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pending_contacts_email ON pending_contacts(email);
        CREATE INDEX IF NOT EXISTS idx_pending_contacts_status ON pending_contacts(status);
        CREATE INDEX IF NOT EXISTS idx_pending_contacts_domain ON pending_contacts(domain);

        CREATE TABLE IF NOT EXISTS thread_participants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          thread_id UUID NOT NULL,
          crm_customer_id UUID,
          pending_contact_id UUID,
          contact_email VARCHAR(255) NOT NULL,
          contact_name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'PARTICIPANT',
          entity_type VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(thread_id, contact_email)
        );
        CREATE INDEX IF NOT EXISTS idx_thread_participants_thread ON thread_participants(thread_id);
        CREATE INDEX IF NOT EXISTS idx_thread_participants_email ON thread_participants(contact_email);
        CREATE INDEX IF NOT EXISTS idx_thread_participants_crm ON thread_participants(crm_customer_id) WHERE crm_customer_id IS NOT NULL;

        UPDATE crm_customers
        SET lead_notes = 'LEGACY_AUTO_CREATED: ' || COALESCE(lead_notes, '')
        WHERE lead_source = 'email_inbound'
          AND (lead_notes IS NULL OR lead_notes NOT LIKE 'LEGACY_AUTO_CREATED%');
      `);
      logger.info('Migration 019: communication backbone schema applied');
    } catch (m019Err: any) {
      logger.warn('Migration 019 failed (non-fatal — tables/columns may already exist)', { error: m019Err.message });
    }

    // Migration 020: Replace hardcoded encryption key with parameterized functions
    try {
      const { pool: dbPool020 } = require('./config/pg-client');
      await dbPool020.query(`
        CREATE OR REPLACE FUNCTION public.encrypt_email_password(password TEXT, key TEXT DEFAULT NULL)
        RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
        DECLARE
          encryption_key TEXT := COALESCE(key, current_setting('app.email_encryption_key', true), 'banxway_email_key_prod_2024');
        BEGIN
          RETURN encode(pgp_sym_encrypt(password, encryption_key), 'base64');
        END;
        $$;

        CREATE OR REPLACE FUNCTION public.decrypt_email_password(encrypted TEXT, key TEXT DEFAULT NULL)
        RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
        DECLARE
          encryption_key TEXT := COALESCE(key, current_setting('app.email_encryption_key', true), 'banxway_email_key_prod_2024');
        BEGIN
          RETURN pgp_sym_decrypt(decode(encrypted, 'base64'), encryption_key);
        END;
        $$;
      `);
      // Set the session-level encryption key from env var
      const envKey = process.env.EMAIL_ENCRYPTION_KEY;
      if (envKey) {
        await dbPool020.query(`SET app.email_encryption_key = '${envKey.replace(/'/g, "''")}'`);
        logger.info('Migration 020: encryption functions upgraded, key from env var');
      } else {
        logger.info('Migration 020: encryption functions upgraded (using legacy fallback key — set EMAIL_ENCRYPTION_KEY env var)');
      }
    } catch (m020Err: any) {
      logger.warn('Migration 020 failed (non-fatal)', { error: m020Err.message });
    }

    // Migration 021: Email tracking events + email templates tables
    try {
      const { pool: dbPool021 } = require('./config/pg-client');
      await dbPool021.query(`
        CREATE TABLE IF NOT EXISTS email_tracking_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          message_id UUID NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          ip_address INET,
          user_agent TEXT,
          geo_city VARCHAR(100),
          geo_country VARCHAR(100),
          geo_region VARCHAR(100),
          link_url TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_tracking_message ON email_tracking_events(message_id);
        CREATE INDEX IF NOT EXISTS idx_tracking_type ON email_tracking_events(event_type);

        CREATE TABLE IF NOT EXISTS email_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          category VARCHAR(100) NOT NULL,
          industry VARCHAR(100),
          subject_template TEXT NOT NULL,
          html_template TEXT NOT NULL,
          text_template TEXT,
          variables JSONB NOT NULL DEFAULT '[]',
          default_attachments JSONB DEFAULT '[]',
          is_active BOOLEAN DEFAULT TRUE,
          created_by UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_templates_category ON email_templates(category);
        CREATE INDEX IF NOT EXISTS idx_templates_active ON email_templates(is_active) WHERE is_active = TRUE;
      `);
      logger.info('Migration 021: email tracking + templates tables created');
    } catch (m021Err: any) {
      logger.warn('Migration 021 failed (non-fatal)', { error: m021Err.message });
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
