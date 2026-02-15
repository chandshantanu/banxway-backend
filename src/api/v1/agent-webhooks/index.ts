import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';

const router = Router();

/**
 * Agent Webhook Receivers
 * Endpoints for AgentBuilder agents to call back into Banxway
 * These are called by deployed agents when they complete processing
 */

/**
 * POST /api/v1/agent-webhooks/ingestion-complete
 * Called when an ingestion agent finishes processing a message
 */
router.post('/ingestion-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, channel, messageId, data, metadata } = req.body;

    logger.info('Ingestion complete webhook received', {
      agentId,
      channel,
      messageId,
    });

    // TODO: Process the ingested data - create/update communication thread
    // Example: await communicationService.processIngestion(data);

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Ingestion webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/processing-complete
 * Called when a processing agent (parser, NLP, intent) completes
 */
router.post('/processing-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, messageId, extractedData, confidence, metadata } = req.body;

    logger.info('Processing complete webhook received', {
      agentId,
      messageId,
      confidence,
    });

    // TODO: Update the communication/shipment with extracted data
    // Example: await shipmentService.updateExtractedData(messageId, extractedData);

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Processing webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/extraction-complete
 * Called when a document extraction agent completes
 */
router.post('/extraction-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, documentId, documentType, extractedFields, confidence, metadata } = req.body;

    logger.info('Document extraction complete webhook received', {
      agentId,
      documentId,
      documentType,
      fieldCount: extractedFields ? Object.keys(extractedFields).length : 0,
    });

    // TODO: Store extracted document data
    // Example: await documentService.storeExtraction(documentId, extractedFields);

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Extraction webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/validation-required
 * Called when human review is needed for a shipment request
 */
router.post('/validation-required', async (req: Request, res: Response) => {
  try {
    const { agentId, shipmentRequestId, priority, reason, data, metadata } = req.body;

    logger.info('Validation required webhook received', {
      agentId,
      shipmentRequestId,
      priority,
      reason,
    });

    // TODO: Create validation queue item
    // Example: await queueService.addValidationItem({ shipmentRequestId, priority, data });

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Validation-required webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/v1/agent-webhooks/validation-complete
 * Called when human or client validation is done
 */
router.post('/validation-complete', async (req: Request, res: Response) => {
  try {
    const { agentId, shipmentRequestId, decision, validatedBy, validationType, metadata } = req.body;

    logger.info('Validation complete webhook received', {
      agentId,
      shipmentRequestId,
      decision,
      validationType,
    });

    // TODO: Update shipment request state based on validation result
    // Example: await shipmentService.applyValidation(shipmentRequestId, decision);

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('Validation-complete webhook failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

export default router;
