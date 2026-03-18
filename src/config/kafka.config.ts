/**
 * Kafka / Azure Event Hubs Configuration
 * Uses KafkaJS with SASL_SSL for Azure Event Hubs Kafka endpoint
 *
 * @created 2026-02-26
 */

import { Kafka, Producer, Consumer, KafkaConfig, logLevel } from 'kafkajs';
import { logger } from '../utils/logger';

// Topic names — must match Event Hubs created in Azure
export const KAFKA_TOPICS = {
  EMAIL_RAW: process.env.KAFKA_TOPIC_EMAIL_RAW || 'messages.raw.email',
  WHATSAPP_RAW: process.env.KAFKA_TOPIC_WHATSAPP_RAW || 'messages.raw.whatsapp',
  PHONE_RAW: process.env.KAFKA_TOPIC_PHONE_RAW || 'messages.raw.phone',
  SMS_RAW: process.env.KAFKA_TOPIC_SMS_RAW || 'messages.raw.sms',
  PROCESSED: process.env.KAFKA_TOPIC_PROCESSED || 'messages.processed',
  DOCUMENTS_EXTRACTED: process.env.KAFKA_TOPIC_DOCS_EXTRACTED || 'messages.documents.extracted',
  BUSINESS: process.env.KAFKA_TOPIC_BUSINESS || 'messages.business',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

function isKafkaEnabled(): boolean {
  return !!(
    process.env.KAFKA_BOOTSTRAP_SERVERS &&
    process.env.KAFKA_SASL_USERNAME &&
    process.env.KAFKA_SASL_PASSWORD
  );
}

function buildKafkaConfig(): KafkaConfig {
  const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || '').split(',').map(s => s.trim());

  return {
    clientId: process.env.KAFKA_CLIENT_ID || 'banxway-backend',
    brokers,
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: process.env.KAFKA_SASL_USERNAME || '$ConnectionString',
      password: process.env.KAFKA_SASL_PASSWORD || '',
    },
    // Suppress verbose KafkaJS internal logs
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
    connectionTimeout: 10000,
    requestTimeout: 30000,
  };
}

let _kafka: Kafka | null = null;
let _producer: Producer | null = null;

export function getKafka(): Kafka {
  if (!isKafkaEnabled()) {
    throw new Error('Kafka not configured: set KAFKA_BOOTSTRAP_SERVERS, KAFKA_SASL_USERNAME, KAFKA_SASL_PASSWORD');
  }
  if (!_kafka) {
    _kafka = new Kafka(buildKafkaConfig());
  }
  return _kafka;
}

/** Get (and lazily connect) the shared producer */
export async function getProducer(): Promise<Producer> {
  if (!_producer) {
    _producer = getKafka().producer({
      allowAutoTopicCreation: false,
      idempotent: true,
    });
    await _producer.connect();
    logger.info('Kafka producer connected');
  }
  return _producer;
}

/** Create a new consumer for a given group — caller is responsible for connecting/disconnecting */
export function createConsumer(groupId: string): Consumer {
  return getKafka().consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });
}

/**
 * Publish a message to a Kafka topic.
 * Silently no-ops if Kafka is not configured (dev fallback).
 */
export async function publishToKafka(
  topic: string,
  payload: Record<string, unknown>,
  key?: string,
): Promise<void> {
  if (!isKafkaEnabled()) {
    logger.debug('Kafka not configured — skipping publish', { topic });
    return;
  }

  try {
    const producer = await getProducer();
    await producer.send({
      topic,
      messages: [
        {
          key: key || undefined,
          value: JSON.stringify(payload),
          headers: {
            'content-type': 'application/json',
            'source': 'banxway-backend',
            'timestamp': new Date().toISOString(),
          },
        },
      ],
    });
    logger.debug('Published to Kafka', { topic, key });
  } catch (error) {
    logger.error('Failed to publish to Kafka', { topic, error: (error as Error).message });
    throw error;
  }
}

/** Gracefully disconnect producer on shutdown */
export async function disconnectProducer(): Promise<void> {
  if (_producer) {
    await _producer.disconnect();
    _producer = null;
    logger.info('Kafka producer disconnected');
  }
}

export { isKafkaEnabled };
