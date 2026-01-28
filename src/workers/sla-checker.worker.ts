import { Worker } from 'bullmq';
import { getRedisConnection, getSlaQueue } from '../config/redis.config';
import { logger } from '../utils/logger';

// Get queue (lazy initialization)
const slaQueue = getSlaQueue();

// Worker to check SLA deadlines
const slaWorker = new Worker(
  'sla-checker',
  async (job) => {
    logger.info('Checking SLA deadlines...');

    // TODO: Implement SLA checking logic
    // 1. Query threads approaching SLA deadline
    // 2. Create notifications
    // 3. Emit WebSocket events

    return { checked: 0, warnings: 0 };
  },
  { connection: getRedisConnection() }
);

slaWorker.on('completed', (job, result) => {
  logger.info('SLA check completed', { result });
});

slaWorker.on('failed', (job, error) => {
  logger.error('SLA check failed', { error: error.message });
});

// Schedule SLA checks every 5 minutes
setInterval(() => {
  slaQueue.add('CHECK_SLA', {});
}, 300000); // 5 minutes

logger.info('SLA checker worker started');

export default slaWorker;
