import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.config';
import { logger } from '../utils/logger';

// Worker to process WhatsApp messages
const whatsappWorker = new Worker(
  'whatsapp-processing',
  async (job) => {
    const { action, data } = job.data;

    switch (action) {
      case 'PROCESS_MESSAGE':
        // TODO: Implement WhatsApp message processing
        logger.info('Processing WhatsApp message', { data });
        break;

      case 'SEND_MESSAGE':
        // TODO: Implement WhatsApp message sending
        logger.info('Sending WhatsApp message', { data });
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
  { connection: redisConnection }
);

whatsappWorker.on('completed', (job) => {
  logger.info('WhatsApp job completed', { jobId: job.id });
});

whatsappWorker.on('failed', (job, error) => {
  logger.error('WhatsApp job failed', { jobId: job?.id, error: error.message });
});

logger.info('WhatsApp processor worker started');

export default whatsappWorker;
