/**
 * Document Processor Worker
 *
 * BullMQ worker for the 'document-processing' queue.
 * Handles PDF, Excel, and Word document extraction using:
 *   - PDF → OpenRouter Qwen VL vision model (via pdf2pic conversion)
 *   - Excel → xlsx library (existing)
 *   - Word → text extraction (raw buffer parsing)
 *
 * @created 2026-02-26
 */

import { Worker, Job, Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { getRedisConnection } from '../config/redis.config';
import { supabaseAdmin } from '../config/database.config';
import { publishToKafka, KAFKA_TOPICS } from '../config/kafka.config';
import { openRouterDocumentService } from '../services/ai/openrouter-document.service';

export interface DocumentProcessingJobData {
  documentId: string;
  threadId?: string;
  messageId?: string;
  documentType: 'pdf' | 'excel' | 'word' | 'image';
  /** Azure Blob Storage URL for the document */
  storageUrl: string;
  /** Original file name */
  fileName: string;
  /** MIME type */
  mimeType: string;
}

export interface ExtractionResult {
  documentId: string;
  documentType: string;
  fields: Record<string, any>;
  confidence: number;
  rawText?: string;
  pageCount?: number;
  extractedAt: string;
}

/**
 * Download a document buffer from a URL
 */
async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download document: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Process a document extraction job
 */
async function processDocumentJob(job: Job<DocumentProcessingJobData>): Promise<ExtractionResult> {
  const { documentId, threadId, documentType, storageUrl, fileName } = job.data;

  logger.info('Processing document extraction job', {
    jobId: job.id,
    documentId,
    documentType,
    fileName,
  });

  // Update status in DB
  await supabaseAdmin
    .from('document_extractions')
    .upsert({
      document_id: documentId,
      status: 'processing',
      document_type: documentType,
      file_name: fileName,
      thread_id: threadId,
      started_at: new Date().toISOString(),
    }, { onConflict: 'document_id' });

  let result: ExtractionResult;

  try {
    const buffer = await downloadBuffer(storageUrl);

    switch (documentType) {
      case 'pdf':
        result = await openRouterDocumentService.extractFromPDF(buffer, documentId);
        break;

      case 'image':
        result = await openRouterDocumentService.extractFromImage(
          buffer.toString('base64'),
          documentId,
        );
        break;

      case 'excel':
        result = await openRouterDocumentService.extractFromExcel(buffer, documentId);
        break;

      case 'word':
        result = await openRouterDocumentService.extractFromWord(buffer, documentId);
        break;

      default:
        throw new Error(`Unsupported document type: ${documentType}`);
    }
  } catch (error: any) {
    logger.error('Document extraction failed', {
      documentId,
      documentType,
      error: error.message,
    });

    await supabaseAdmin
      .from('document_extractions')
      .upsert({
        document_id: documentId,
        status: 'failed',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      }, { onConflict: 'document_id' });

    throw error;
  }

  // Persist extraction result
  await supabaseAdmin
    .from('document_extractions')
    .upsert({
      document_id: documentId,
      thread_id: threadId,
      status: 'completed',
      document_type: documentType,
      file_name: fileName,
      extracted_fields: result.fields,
      confidence: result.confidence,
      raw_text: result.rawText,
      page_count: result.pageCount,
      completed_at: result.extractedAt,
    }, { onConflict: 'document_id' });

  // Publish extraction result to Kafka for downstream agents
  await publishToKafka(KAFKA_TOPICS.DOCUMENTS_EXTRACTED, {
    documentId,
    threadId,
    documentType,
    extractedFields: result.fields,
    confidence: result.confidence,
    pageCount: result.pageCount,
    extractedAt: result.extractedAt,
  }, documentId);

  logger.info('Document extraction completed', {
    jobId: job.id,
    documentId,
    documentType,
    fieldCount: Object.keys(result.fields).length,
    confidence: result.confidence,
  });

  return result;
}

/**
 * Create and start the document processor worker
 */
export function createDocumentProcessorWorker(): Worker<DocumentProcessingJobData> {
  const worker = new Worker('document-processing', processDocumentJob, {
    connection: getRedisConnection(),
    concurrency: 3, // PDF vision extraction is slow, limit concurrency
  });

  worker.on('completed', (job) => {
    logger.info('Document processing job completed', {
      jobId: job.id,
      documentId: job.data.documentId,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Document processing job failed', {
      jobId: job?.id,
      documentId: job?.data.documentId,
      error: error.message,
    });
  });

  worker.on('error', (error) => {
    logger.error('Document processor worker error', { error: error.message });
  });

  logger.info('Document processor worker started', { concurrency: 3 });
  return worker;
}

/**
 * Enqueue a document for processing
 */
export async function queueDocumentProcessing(
  data: DocumentProcessingJobData,
): Promise<string> {
  const queue = new Queue('document-processing', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { age: 7200 },
      removeOnFail: { age: 86400 },
    },
  });

  const job = await queue.add('extract', data, {
    jobId: `doc-${data.documentId}`,
  });

  logger.info('Document queued for processing', {
    jobId: job.id,
    documentId: data.documentId,
    documentType: data.documentType,
  });

  return job.id!;
}

export default {
  createDocumentProcessorWorker,
  queueDocumentProcessing,
};
