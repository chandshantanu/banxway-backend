import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis connection for BullMQ
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

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
