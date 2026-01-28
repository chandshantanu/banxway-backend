import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

// Lazy initialization to ensure environment variables are fully loaded
let _redisConnection: Redis | null = null;
let _redisUrl: string | null = null;
let _maskedUrl: string | null = null;

function initializeRedis(): Redis {
  if (_redisConnection) {
    return _redisConnection;
  }

  // DEBUG: Check if REDIS_URL is set - write directly to stderr so it shows in logs
  process.stderr.write(`[REDIS-DEBUG] Initializing Redis connection...\n`);
  process.stderr.write(`[REDIS-DEBUG] REDIS_URL env: ${process.env.REDIS_URL ? 'SET-length-' + process.env.REDIS_URL.length : 'NOT-SET'}\n`);
  process.stderr.write(`[REDIS-DEBUG] REDIS env keys: ${Object.keys(process.env).filter(k => k.toUpperCase().includes('REDIS')).join(',')}\n`);

  _redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  process.stderr.write(`[REDIS-DEBUG] Using URL: ${_redisUrl.substring(0, 30)}...\n`);

  // Mask password in URL for logging
  _maskedUrl = _redisUrl.replace(/:[^:@]+@/, ':****@');

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
  if (_redisUrl.startsWith('rediss://')) {
    redisOptions.tls = {
      rejectUnauthorized: false, // Accept Azure's self-signed cert
    };
  }

  // Create Redis connection for BullMQ
  _redisConnection = new Redis(_redisUrl, redisOptions);

  return _redisConnection;
}

// Export getter to ensure lazy initialization
export const redisConnection = new Proxy({} as Redis, {
  get(target, prop) {
    const redis = initializeRedis();
    return (redis as any)[prop];
  }
});

// Log config for debugging
export function logRedisConfig() {
  // Ensure Redis is initialized first
  initializeRedis();

  return {
    url: _maskedUrl || 'NOT INITIALIZED',
    hasEnvVar: !!process.env.REDIS_URL,
    envValue: process.env.REDIS_URL ? 'SET' : 'NOT SET',
    useTLS: _redisUrl?.startsWith('rediss://') || false,
  };
}

// Lazy queue initialization
let _emailQueue: Queue | null = null;
let _whatsappQueue: Queue | null = null;
let _aiQueue: Queue | null = null;
let _documentQueue: Queue | null = null;
let _analyticsQueue: Queue | null = null;
let _slaQueue: Queue | null = null;
let _agentQueue: Queue | null = null;
let _emailQueueEvents: QueueEvents | null = null;
let _whatsappQueueEvents: QueueEvents | null = null;

function getQueue<T extends Queue | QueueEvents>(
  queueVar: T | null,
  queueName: string,
  queueType: 'Queue' | 'QueueEvents',
  options?: any
): T {
  if (queueVar) return queueVar;

  const redis = initializeRedis();

  if (queueType === 'Queue') {
    return new Queue(queueName, { connection: redis, ...options }) as T;
  } else {
    return new QueueEvents(queueName, { connection: redis }) as T;
  }
}

// Export queues with lazy initialization
export const emailQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_emailQueue) {
      _emailQueue = getQueue<Queue>(_emailQueue, 'email-processing', 'Queue', {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });
    }
    return (_emailQueue as any)[prop];
  }
});

export const whatsappQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_whatsappQueue) {
      _whatsappQueue = getQueue<Queue>(_whatsappQueue, 'whatsapp-processing', 'Queue', {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      });
    }
    return (_whatsappQueue as any)[prop];
  }
});

export const aiQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_aiQueue) {
      _aiQueue = getQueue<Queue>(_aiQueue, 'ai-processing', 'Queue', {
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 1000 },
        },
      });
    }
    return (_aiQueue as any)[prop];
  }
});

export const documentQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_documentQueue) {
      _documentQueue = getQueue<Queue>(_documentQueue, 'document-processing', 'Queue', {
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
        },
      });
    }
    return (_documentQueue as any)[prop];
  }
});

export const analyticsQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_analyticsQueue) {
      _analyticsQueue = getQueue<Queue>(_analyticsQueue, 'analytics', 'Queue', {
        defaultJobOptions: {
          attempts: 2,
          removeOnComplete: 50,
        },
      });
    }
    return (_analyticsQueue as any)[prop];
  }
});

export const slaQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_slaQueue) {
      _slaQueue = getQueue<Queue>(_slaQueue, 'sla-checker', 'Queue', {
        defaultJobOptions: {
          attempts: 2,
        },
      });
    }
    return (_slaQueue as any)[prop];
  }
});

export const agentQueue = new Proxy({} as Queue, {
  get(target, prop) {
    if (!_agentQueue) {
      _agentQueue = getQueue<Queue>(_agentQueue, 'agent-tasks', 'Queue', {
        defaultJobOptions: {
          attempts: 3,
        },
      });
    }
    return (_agentQueue as any)[prop];
  }
});

// Queue events for monitoring
export const emailQueueEvents = new Proxy({} as QueueEvents, {
  get(target, prop) {
    if (!_emailQueueEvents) {
      _emailQueueEvents = getQueue<QueueEvents>(_emailQueueEvents, 'email-processing', 'QueueEvents');
    }
    return (_emailQueueEvents as any)[prop];
  }
});

export const whatsappQueueEvents = new Proxy({} as QueueEvents, {
  get(target, prop) {
    if (!_whatsappQueueEvents) {
      _whatsappQueueEvents = getQueue<QueueEvents>(_whatsappQueueEvents, 'whatsapp-processing', 'QueueEvents');
    }
    return (_whatsappQueueEvents as any)[prop];
  }
});
