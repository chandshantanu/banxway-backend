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

// Export getter function for Redis connection - use this instead of direct export
export function getRedisConnection(): Redis {
  if (!_redisConnection) {
    _redisConnection = createRedisConnection();
  }
  return _redisConnection;
}

// DO NOT export redisConnection as a const - it would execute getRedisConnection() at module load time
// Instead, consumers must call getRedisConnection() when they need the connection

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

// Getter functions for queues - initialize only when called
export function getEmailQueue(): Queue {
  return new Queue('email-processing', {
    connection: getRedisConnection(),
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
}

export function getWhatsappQueue(): Queue {
  return new Queue('whatsapp-processing', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
    },
  },
  });
}

export function getAiQueue(): Queue {
  return new Queue('ai-processing', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });
}

export function getDocumentQueue(): Queue {
  return new Queue('document-processing', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    },
  });
}

export function getAnalyticsQueue(): Queue {
  return new Queue('analytics', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      removeOnComplete: 50,
    },
  });
}

export function getSlaQueue(): Queue {
  return new Queue('sla-checker', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
    },
  });
}

export function getAgentQueue(): Queue {
  return new Queue('agent-tasks', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
    },
  });
}

// Queue events getters
export function getEmailQueueEvents(): QueueEvents {
  return new QueueEvents('email-processing', {
    connection: getRedisConnection(),
  });
}

export function getWhatsappQueueEvents(): QueueEvents {
  return new QueueEvents('whatsapp-processing', {
    connection: getRedisConnection(),
  });
}
