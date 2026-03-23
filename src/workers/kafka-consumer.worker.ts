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
import { logger } from '../utils/logger';
import {
  createConsumer,
  isKafkaEnabled,
  KAFKA_TOPICS,
} from '../config/kafka.config';
import agentBuilderService from '../services/agentbuilder/agentbuilder.service';
import { AGENTBUILDER_CONFIG } from '../services/agentbuilder/mcp-config';

const CONSUMER_GROUP = 'banxway-backend-agents';

let consumer: Consumer | null = null;

// Map Kafka topics to agent IDs for L1 invocation
function getAgentIdForTopic(topic: string): string | null {
  const agents = AGENTBUILDER_CONFIG.agents;
  switch (topic) {
    case KAFKA_TOPICS.EMAIL_RAW:
      return agents.emailIngestion;
    case KAFKA_TOPICS.WHATSAPP_RAW:
      return agents.whatsappIngestion;
    case KAFKA_TOPICS.PHONE_RAW:
      return agents.phoneCallIngestion;
    case KAFKA_TOPICS.SMS_RAW:
      return agents.whatsappIngestion; // SMS shares WhatsApp agent
    case KAFKA_TOPICS.DOCUMENTS_EXTRACTED:
      return agents.shipmentRequest; // Doc results go to business layer
    default:
      return null;
  }
}

/**
 * Route a Kafka message to the appropriate AgentBuilder agent
 */
async function routeToAgent(topic: string, payload: Record<string, any>): Promise<void> {
  const agentId = getAgentIdForTopic(topic);
  if (!agentId) {
    logger.warn('No agent mapped for Kafka topic', { topic });
    return;
  }

  try {
    await agentBuilderService.executeAgent(agentId, {
      source: topic,
      ...payload,
      callbackUrl: `${process.env.EXOTEL_WEBHOOK_BASE_URL || 'https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io'}/api/v1/agent-webhooks/ingestion-complete`,
    });
    logger.info('Agent invoked via Kafka message', { topic, agentId, messageId: payload.messageId });
  } catch (error) {
    logger.error('Failed to invoke agent from Kafka', {
      topic,
      agentId,
      error: (error as Error).message,
    });
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
        await routeToAgent(topic, payload);
      } catch (error) {
        logger.error('Failed to route Kafka message to agent', {
          topic,
          partition,
          error: (error as Error).message,
        });
        // Don't rethrow — Kafka will not retry for consumer errors; we log and move on
      }
    },
  });

  logger.info('Kafka → Agent bridge worker running', { topics: topicsToSubscribe });
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
