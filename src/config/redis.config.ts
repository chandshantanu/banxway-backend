import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Mask password in URL for logging
const maskedUrl = redisUrl.replace(/:[^:@]+@/, ':****@');

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
if (redisUrl.startsWith('rediss://')) {
  redisOptions.tls = {
    rejectUnauthorized: false, // Accept Azure's self-signed cert
  };
}

// Redis connection for BullMQ
export const redisConnection = new Redis(redisUrl, redisOptions);

// Log config for debugging (will be called when imported)
export function logRedisConfig() {
  return {
    url: maskedUrl,
    hasEnvVar: !!process.env.REDIS_URL,
    envValue: process.env.REDIS_URL ? 'SET' : 'NOT SET',
    useTLS: redisUrl.startsWith('rediss://'),
  };
}

// Define queues
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
