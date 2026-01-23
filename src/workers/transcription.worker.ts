import { Worker, Job, Queue } from 'bullmq';
import { logger } from '../utils/logger';
import transcriptionService from '../services/transcription/transcription.service';
import { supabaseAdmin } from '../config/database.config';
import { io } from '../index';

// Redis connection for BullMQ
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

// Create transcription queue
export const transcriptionQueue = new Queue('transcription', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

export interface TranscriptionJobData {
  messageId: string;
  threadId: string;
  audioUrl: string;
  callSid: string;
}

/**
 * Process transcription job
 */
async function processTranscriptionJob(job: Job<TranscriptionJobData>): Promise<void> {
  const { messageId, threadId, audioUrl, callSid } = job.data;

  logger.info('Processing transcription job', {
    jobId: job.id,
    messageId,
    callSid,
  });

  try {
    // Update status to IN_PROGRESS
    await supabaseAdmin
      .from('communication_messages')
      .update({
        transcription_status: 'IN_PROGRESS',
      })
      .eq('id', messageId);

    // Transcribe audio
    const result = await transcriptionService.transcribe(audioUrl);

    // Update message with transcription
    const { data: updatedMessage, error } = await supabaseAdmin
      .from('communication_messages')
      .update({
        content: result.text,
        transcription_status: 'COMPLETED',
        transcription_language: result.language,
        transcription_confidence: result.confidence,
        metadata: {
          transcription: {
            duration: result.duration,
            segments: result.segments,
            completedAt: new Date().toISOString(),
          },
        },
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Emit WebSocket event for real-time update
    io.to(`thread:${threadId}`).emit('thread:transcription_complete', {
      threadId,
      messageId,
      transcription: result.text,
      language: result.language,
      confidence: result.confidence,
    });

    logger.info('Transcription completed successfully', {
      jobId: job.id,
      messageId,
      textLength: result.text.length,
      language: result.language,
    });
  } catch (error: any) {
    logger.error('Transcription job failed', {
      jobId: job.id,
      messageId,
      error: error.message,
    });

    // Update status to FAILED
    await supabaseAdmin
      .from('communication_messages')
      .update({
        transcription_status: 'FAILED',
        metadata: {
          transcription: {
            error: error.message,
            failedAt: new Date().toISOString(),
          },
        },
      })
      .eq('id', messageId);

    throw error;
  }
}

/**
 * Create and start transcription worker
 */
export function createTranscriptionWorker(): Worker<TranscriptionJobData> {
  const worker = new Worker('transcription', processTranscriptionJob, {
    connection,
    concurrency: 5, // Process up to 5 transcriptions concurrently
  });

  worker.on('completed', (job) => {
    logger.info('Transcription job completed', {
      jobId: job.id,
      messageId: job.data.messageId,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Transcription job failed', {
      jobId: job?.id,
      messageId: job?.data.messageId,
      error: error.message,
    });
  });

  worker.on('error', (error) => {
    logger.error('Transcription worker error', {
      error: error.message,
    });
  });

  logger.info('Transcription worker started', {
    concurrency: 5,
  });

  return worker;
}

/**
 * Add transcription job to queue
 */
export async function queueTranscription(data: TranscriptionJobData): Promise<string> {
  try {
    const job = await transcriptionQueue.add('transcribe', data, {
      jobId: `transcription-${data.messageId}`,
    });

    logger.info('Transcription job queued', {
      jobId: job.id,
      messageId: data.messageId,
    });

    return job.id!;
  } catch (error: any) {
    logger.error('Failed to queue transcription', {
      error: error.message,
      data,
    });
    throw error;
  }
}

/**
 * Get transcription job status
 */
export async function getTranscriptionJobStatus(jobId: string): Promise<any> {
  try {
    const job = await transcriptionQueue.getJob(jobId);

    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      status: state,
      progress,
      data: job.data,
      attemptsMade: job.attemptsMade,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  } catch (error: any) {
    logger.error('Failed to get transcription job status', {
      error: error.message,
      jobId,
    });
    throw error;
  }
}

// Export for use in main application
export default {
  createTranscriptionWorker,
  queueTranscription,
  getTranscriptionJobStatus,
  transcriptionQueue,
};
