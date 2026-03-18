/**
 * Kafka Consumer → BullMQ Bridge Worker
 *
 * Consumes messages from Azure Event Hubs (Kafka protocol) across all
 * ingestion topics and enqueues them into the appropriate BullMQ queues
 * for downstream processing.
 *
 * Topics consumed:
 *   messages.raw.email      → email-processing queue
 *   messages.raw.whatsapp   → whatsapp-processing queue
 *   messages.raw.phone      → transcription queue
 *   messages.raw.sms        → whatsapp-processing queue (shared)
 *   messages.documents.*    → document-processing queue
 *
 * @created 2026-02-26
 */

import { Consumer } from 'kafkajs';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
import {
  createConsumer,
  isKafkaEnabled,
  KAFKA_TOPICS,
} from '../config/kafka.config';
import { getRedisConnection, getDocumentQueue } from '../config/redis.config';

// BullMQ queues that Kafka messages get routed into
const emailQueue = new Queue('email-processing', { connection: getRedisConnection() });
const whatsappQueue = new Queue('whatsapp-processing', { connection: getRedisConnection() });
const transcriptionQueue = new Queue('transcription', { connection: getRedisConnection() });
const documentQueue = getDocumentQueue();

const CONSUMER_GROUP = 'banxway-backend-ingestion';

let consumer: Consumer | null = null;

/**
 * Route a Kafka message to the appropriate BullMQ queue
 */
async function routeToQueue(topic: string, payload: Record<string, any>): Promise<void> {
  switch (topic) {
    case KAFKA_TOPICS.EMAIL_RAW:
      await emailQueue.add('process-email', payload, {
        jobId: `kafka-email-${payload.messageId || Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      logger.debug('Routed email message to BullMQ', { topic });
      break;

    case KAFKA_TOPICS.WHATSAPP_RAW:
    case KAFKA_TOPICS.SMS_RAW:
      await whatsappQueue.add('process-whatsapp', payload, {
        jobId: `kafka-wa-${payload.messageId || Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      logger.debug('Routed WhatsApp/SMS message to BullMQ', { topic });
      break;

    case KAFKA_TOPICS.PHONE_RAW:
      await transcriptionQueue.add('transcribe', payload, {
        jobId: `kafka-phone-${payload.messageId || Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
      logger.debug('Routed phone call to transcription queue', { topic });
      break;

    case KAFKA_TOPICS.DOCUMENTS_EXTRACTED:
      await documentQueue.add('process-extracted-document', payload, {
        jobId: `kafka-doc-${payload.documentId || Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
      });
      logger.debug('Routed document extraction result to BullMQ', { topic });
      break;

    default:
      logger.warn('Received Kafka message for unhandled topic', { topic });
  }
}

/**
 * Start the Kafka consumer bridge
 */
export async function startKafkaConsumer(): Promise<void> {
  if (!isKafkaEnabled()) {
    logger.warn('Kafka not configured — kafka-consumer.worker will not start');
    return;
  }

  const topicsToSubscribe = [
    KAFKA_TOPICS.EMAIL_RAW,
    KAFKA_TOPICS.WHATSAPP_RAW,
    KAFKA_TOPICS.PHONE_RAW,
    KAFKA_TOPICS.SMS_RAW,
    KAFKA_TOPICS.DOCUMENTS_EXTRACTED,
  ];

  consumer = createConsumer(CONSUMER_GROUP);

  await consumer.connect();
  logger.info('Kafka consumer connected', { group: CONSUMER_GROUP });

  await consumer.subscribe({
    topics: topicsToSubscribe,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const rawValue = message.value?.toString();
      if (!rawValue) return;

      let payload: Record<string, any>;
      try {
        payload = JSON.parse(rawValue);
      } catch {
        logger.warn('Kafka message is not valid JSON', { topic, partition });
        return;
      }

      try {
        await routeToQueue(topic, payload);
      } catch (error) {
        logger.error('Failed to route Kafka message to BullMQ', {
          topic,
          partition,
          error: (error as Error).message,
        });
        // Don't rethrow — Kafka will not retry for consumer errors; we log and move on
      }
    },
  });

  logger.info('Kafka → BullMQ bridge worker running', { topics: topicsToSubscribe });
}

/**
 * Stop the Kafka consumer gracefully
 */
export async function stopKafkaConsumer(): Promise<void> {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
    logger.info('Kafka consumer disconnected');
  }
}

export default { startKafkaConsumer, stopKafkaConsumer };
