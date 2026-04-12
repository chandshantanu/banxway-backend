/**
 * Kafka Consumer → Agent Bridge Worker
 *
 * Consumes messages from Azure Event Hubs (Kafka protocol) and routes them
 * to the appropriate AgentBuilder agents or backend-native handlers.
 *
 * Topics consumed:
 *   messages.raw.email      → L1 emailIngestion agent
 *   messages.raw.whatsapp   → L1 whatsappIngestion agent
 *   messages.raw.phone      → L1 phoneCallIngestion agent
 *   messages.raw.sms        → L1 whatsappIngestion agent (shared)
 *   messages.processed      → L2 processing agents (intent, NLP, correlation)
 *   messages.documents.*    → L3 document extraction agents
 *   messages.business       → L4 business agents (shipment request, rate quote)
 *
 * @created 2026-02-26
 * @updated 2026-04-12 — added L2/L4 routing for messages.processed & messages.business
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
import { queueAgentResult } from './agent-result.worker';

const CONSUMER_GROUP = 'banxway-backend-agents';
const CALLBACK_BASE = process.env.EXOTEL_WEBHOOK_BASE_URL
  || 'https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io';

let consumer: Consumer | null = null;

/**
 * Route L1 (ingestion) topics to a single agent.
 */
function getL1AgentId(topic: string): string | null {
  const agents = AGENTBUILDER_CONFIG.agents;
  switch (topic) {
    case KAFKA_TOPICS.EMAIL_RAW:       return agents.emailIngestion;
    case KAFKA_TOPICS.WHATSAPP_RAW:    return agents.whatsappIngestion;
    case KAFKA_TOPICS.PHONE_RAW:       return agents.phoneCallIngestion;
    case KAFKA_TOPICS.SMS_RAW:         return agents.whatsappIngestion;
    case KAFKA_TOPICS.DOCUMENTS_EXTRACTED: return agents.pdfExtractor;
    default:                           return null;
  }
}

/**
 * Route a Kafka message to a single agent via HTTP execute.
 */
async function invokeAgent(
  agentId: string,
  payload: Record<string, any>,
  callbackEndpoint: string
): Promise<void> {
  await agentBuilderService.executeAgent(agentId, {
    ...payload,
    callbackUrl: `${CALLBACK_BASE}/api/v1/agent-webhooks/${callbackEndpoint}`,
  });
}

/**
 * Handle messages.raw.* — invoke the corresponding L1 ingestion agent.
 */
async function handleL1(topic: string, payload: Record<string, any>): Promise<void> {
  const agentId = getL1AgentId(topic);
  if (!agentId) {
    logger.warn('No L1 agent mapped for topic', { topic });
    return;
  }
  await invokeAgent(agentId, { source: topic, ...payload }, 'ingestion-complete');
  logger.info('L1 agent invoked', { topic, agentId, messageId: payload.messageId });
}

/**
 * Handle messages.processed — invoke L2 processing agents.
 *
 * The L2 layer runs three agents that can operate in parallel:
 *   1. intentClassification — labels the message intent (quote_request, booking, etc.)
 *   2. nlpExtractor — extracts entities (origin, destination, cargo, weight)
 *   3. correlationEngine — matches sender to existing CRM customer/shipment
 *
 * Each calls back to its own webhook. If any agent fails, the others still run.
 * We also run the backend-native fallback parser so that even if all agents fail,
 * the message still gets classified (at lower confidence).
 */
async function handleL2(payload: Record<string, any>): Promise<void> {
  const agents = AGENTBUILDER_CONFIG.agents;
  const { threadId, messageId } = payload;

  logger.info('L2 processing pipeline starting', { threadId, messageId });

  // Fire all three L2 agents in parallel — each has its own callback
  const l2Tasks = [
    {
      agentId: agents.intentClassification,
      name: 'intentClassification',
      callback: 'processing-complete',
    },
    {
      agentId: agents.nlpExtractor,
      name: 'nlpExtractor',
      callback: 'processing-complete',
    },
    {
      agentId: agents.correlationEngine,
      name: 'correlationEngine',
      callback: 'correlation-complete',
    },
  ];

  const results = await Promise.allSettled(
    l2Tasks.map(async (task) => {
      try {
        await invokeAgent(task.agentId, payload, task.callback);
        logger.info('L2 agent invoked', { agent: task.name, threadId });
      } catch (err) {
        logger.error('L2 agent invocation failed', {
          agent: task.name,
          threadId,
          error: (err as Error).message,
        });
        throw err;
      }
    })
  );

  // Fallback: if intentClassification agent failed, run the backend-native fallback
  // so the message still gets a classification (lower confidence, regex-based).
  const intentResult = results[0];
  if (intentResult.status === 'rejected') {
    logger.warn('Intent agent failed — running backend fallback parser', { threadId });
    try {
      const parseResult = await agentBuilderService.parseCommunication({
        channel: payload.channel || 'EMAIL',
        content: payload.rawContent || payload.content || '',
        subject: payload.subject,
        sender: {
          email: payload.from || payload.fromEmail,
          name: payload.fromName,
        },
      });

      // Write the fallback result directly to the message
      await queueAgentResult({
        resultType: 'processing_complete',
        agentId: 'fallback-parser',
        entityId: messageId || threadId,
        payload: {
          intent: parseResult.intent,
          entities: parseResult.entities,
          confidence: parseResult.confidence,
        },
      });

      logger.info('Fallback classification applied', {
        threadId, intent: parseResult.intent, confidence: parseResult.confidence,
      });
    } catch (fallbackErr) {
      logger.error('Fallback parser also failed', { error: (fallbackErr as Error).message });
    }
  }

  logger.info('L2 processing pipeline dispatched', {
    threadId,
    succeeded: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  });
}

/**
 * Handle messages.business — invoke L4 business agents.
 *
 * Routes to shipmentRequest or rateQuote based on the intent in the payload.
 */
async function handleL4(payload: Record<string, any>): Promise<void> {
  const agents = AGENTBUILDER_CONFIG.agents;
  const { intent, messageId } = payload;

  logger.info('L4 business pipeline starting', { intent, messageId });

  if (intent === 'quote_request' || intent === 'booking') {
    // Invoke both shipmentRequest and rateQuote agents in parallel
    await Promise.allSettled([
      invokeAgent(agents.shipmentRequest, payload, 'business-result')
        .then(() => logger.info('L4 shipmentRequest agent invoked', { messageId }))
        .catch(err => logger.error('L4 shipmentRequest agent failed', { error: (err as Error).message })),
      invokeAgent(agents.rateQuote, payload, 'business-result')
        .then(() => logger.info('L4 rateQuote agent invoked', { messageId }))
        .catch(err => logger.error('L4 rateQuote agent failed', { error: (err as Error).message })),
    ]);
  } else if (intent === 'shipment_update' || intent === 'status_inquiry') {
    await invokeAgent(agents.workflowOrchestration, payload, 'business-result')
      .catch(err => logger.error('L4 workflowOrchestration agent failed', { error: (err as Error).message }));
  } else {
    logger.debug('L4: no business agent for intent', { intent, messageId });
  }
}

/**
 * Main message router — determines which pipeline stage to invoke.
 */
async function routeMessage(topic: string, payload: Record<string, any>): Promise<void> {
  switch (topic) {
    // L1 — ingestion
    case KAFKA_TOPICS.EMAIL_RAW:
    case KAFKA_TOPICS.WHATSAPP_RAW:
    case KAFKA_TOPICS.PHONE_RAW:
    case KAFKA_TOPICS.SMS_RAW:
    case KAFKA_TOPICS.DOCUMENTS_EXTRACTED:
      await handleL1(topic, payload);
      break;

    // L2 — processing (intent classification, NLP extraction, correlation)
    case KAFKA_TOPICS.PROCESSED:
      await handleL2(payload);
      break;

    // L4 — business (shipment requests, rate quotes)
    case KAFKA_TOPICS.BUSINESS:
      await handleL4(payload);
      break;

    default:
      logger.warn('No handler for Kafka topic', { topic });
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
    KAFKA_TOPICS.PROCESSED,
    KAFKA_TOPICS.DOCUMENTS_EXTRACTED,
    KAFKA_TOPICS.BUSINESS,
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
        await routeMessage(topic, payload);
      } catch (error) {
        logger.error('Failed to route Kafka message', {
          topic,
          partition,
          error: (error as Error).message,
        });
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
