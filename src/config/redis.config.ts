import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

// Lazy initialization to ensure environment variables are fully loaded
let _redisConnection: Redis | null = null;
let _redisUrl: string | null = null;
let _maskedUrl: string | null = null;
let _queuesInitialized = false;

function getRedisConfig() {
  if (_redisUrl) {
    return { url: _redisUrl, maskedUrl: _maskedUrl! };
  }

  // DEBUG: Check if REDIS_URL is set - write directly to stderr so it shows in logs
  process.stderr.write(`[REDIS-DEBUG] Reading Redis configuration...\n`);
  process.stderr.write(`[REDIS-DEBUG] REDIS_URL env: ${process.env.REDIS_URL ? 'SET-length-' + process.env.REDIS_URL.length : 'NOT-SET'}\n`);
  process.stderr.write(`[REDIS-DEBUG] REDIS env keys: ${Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS')).join(',')}\n`);

  _redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  process.stderr.write(`[REDIS-DEBUG] Using URL: ${_redisUrl.substring(0, 30)}...\n`);

  // Mask password in URL for logging
  _maskedUrl = _redisUrl.replace(/:[^:@]+@/, ':****@');

  return { url: _redisUrl, maskedUrl: _maskedUrl };
}

function createRedisConnection(): Redis {
  const { url } = getRedisConfig();

  // Parse Redis URL and configure TLS for Azure Redis
  const redisOptions: any = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 100,
    retryDelayOnTryAgain: 100,
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true, // Don't connect immediately
  };

  // If using Azure Redis with TLS (rediss://)
  if (url.startsWith('rediss://')) {
    redisOptions.tls = {
      rejectUnauthorized: false, // Accept Azure's self-signed cert
    };
  }

  // Create Redis connection for BullMQ
  return new Redis(url, redisOptions);
}

// Export getter function for Redis connection (not Proxy - causes issues with ioredis)
export function getRedisConnection(): Redis {
  if (!_redisConnection) {
    _redisConnection = createRedisConnection();
  }
  return _redisConnection;
}

// For backward compatibility with existing code
export const redisConnection = getRedisConnection();

// Log config for debugging
export function logRedisConfig() {
  const { maskedUrl, url } = getRedisConfig();

  return {
    url: maskedUrl,
    hasEnvVar: !!process.env.REDIS_URL,
    envValue: process.env.REDIS_URL ? 'SET' : 'NOT SET',
    useTLS: url.startsWith('rediss://'),
  };
}

// Define queues (now using lazily-initialized Redis connection)
export const emailQueue = new Queue('email-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const whatsappQueue = new Queue('whatsapp-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const aiQueue = new Queue('ai-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const documentQueue = new Queue('document-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
});

export const analyticsQueue = new Queue('analytics', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 50,
  },
});

export const slaQueue = new Queue('sla-checker', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
  },
});

export const agentQueue = new Queue('agent-tasks', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
  },
});

// Queue events for monitoring
export const emailQueueEvents = new QueueEvents('email-processing', {
  connection: redisConnection,
});

export const whatsappQueueEvents = new QueueEvents('whatsapp-processing', {
  connection: redisConnection,
});
