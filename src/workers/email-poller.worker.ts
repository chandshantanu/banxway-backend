import { Worker } from 'bullmq';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { redisConnection, emailQueue } from '../config/redis.config';
import { emailConfig, EMAIL_POLL_INTERVAL } from '../config/email.config';
import { parseEmailBuffer, findReferenceInSubject } from '../utils/email-parser';
import threadRepository from '../database/repositories/thread.repository';
import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';
import { Channel, MessageDirection, ThreadType } from '../types';
import { io } from '../index';

// Worker to process email jobs
const emailWorker = new Worker(
  'email-processing',
  async (job) => {
    const { action, data } = job.data;

    switch (action) {
      case 'POLL_INBOX':
        return await pollInbox();

      case 'PROCESS_EMAIL':
        return await processEmail(data.emailBuffer);

      case 'SEND_EMAIL':
        return await sendEmail(data);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
  { connection: redisConnection }
);

emailWorker.on('completed', (job) => {
  logger.info('Email job completed', { jobId: job.id, action: job.data.action });
});

emailWorker.on('failed', (job, error) => {
  logger.error('Email job failed', {
    jobId: job?.id,
    action: job?.data.action,
    error: error.message,
  });
});

// Poll inbox periodically
async function pollInbox(): Promise<void> {
  logger.info('Polling email inbox...');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: emailConfig.imap.user,
      password: emailConfig.imap.password,
      host: emailConfig.imap.host,
      port: emailConfig.imap.port,
      tls: emailConfig.imap.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          logger.error('Error opening inbox', { error: err.message });
          reject(err);
          return;
        }

        // Search for unseen emails
        imap.search(['UNSEEN'], (err, results) => {
          if (err) {
            logger.error('Error searching emails', { error: err.message });
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            logger.info('No new emails');
            imap.end();
            resolve();
            return;
          }

          logger.info(`Found ${results.length} new emails`);

          const fetch = imap.fetch(results, { bodies: '', markSeen: true });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', () => {
                // Queue email processing
                emailQueue.add('PROCESS_EMAIL', {
                  action: 'PROCESS_EMAIL',
                  data: { emailBuffer: buffer },
                });
              });
            });
          });

          fetch.once('error', (err) => {
            logger.error('Fetch error', { error: err.message });
            reject(err);
          });

          fetch.once('end', () => {
            logger.info('Email fetch completed');
            imap.end();
            resolve();
          });
        });
      });
    });

    imap.once('error', (err) => {
      logger.error('IMAP error', { error: err.message });
      reject(err);
    });

    imap.connect();
  });
}

// Process individual email
async function processEmail(emailBuffer: string): Promise<void> {
  try {
    const parsed = await parseEmailBuffer(Buffer.from(emailBuffer));

    logger.info('Processing email', {
      from: parsed.from.address,
      subject: parsed.subject,
      messageId: parsed.messageId,
    });

    // Find or create customer
    let customer = await findCustomerByEmail(parsed.from.address);
    if (!customer) {
      customer = await createCustomer(parsed.from);
    }

    // Find or create thread
    let thread = null;

    // Strategy 1: Check for reference in subject
    const reference = findReferenceInSubject(parsed.subject);
    if (reference) {
      thread = await threadRepository.findByReference(reference);
    }

    // Strategy 2: Check In-Reply-To header
    if (!thread && parsed.inReplyTo) {
      const replyToMessage = await findMessageByExternalId(parsed.inReplyTo);
      if (replyToMessage) {
        thread = await threadRepository.findById(replyToMessage.thread_id);
      }
    }

    // Strategy 3: Create new thread
    if (!thread) {
      thread = await threadRepository.create(
        {
          type: ThreadType.QUERY,
          customer_id: customer.id,
          primary_channel: Channel.EMAIL,
        },
        customer.id // System user
      );
    }

    // Create message
    const message = await supabaseAdmin
      .from('communication_messages')
      .insert({
        thread_id: thread.id,
        channel: Channel.EMAIL,
        direction: MessageDirection.INBOUND,
        content: parsed.text,
        html_content: parsed.html,
        subject: parsed.subject,
        from_address: parsed.from.address,
        from_name: parsed.from.name,
        to_addresses: parsed.to,
        cc_addresses: parsed.cc,
        external_id: parsed.messageId,
        external_thread_id: parsed.inReplyTo,
        attachments: parsed.attachments,
      })
      .select()
      .single();

    if (message.data) {
      logger.info('Email processed successfully', {
        threadId: thread.id,
        messageId: message.data.id,
      });

      // Emit WebSocket event
      io.to(`thread:${thread.id}`).emit('thread:message', {
        threadId: thread.id,
        message: message.data,
      });

      // Queue AI processing
      // TODO: Add to AI queue for sentiment analysis, intent detection, etc.
    }
  } catch (error: any) {
    logger.error('Error processing email', { error: error.message });
    throw error;
  }
}

async function findCustomerByEmail(email: string): Promise<any> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('email', email)
    .single();

  return data;
}

async function createCustomer(from: any): Promise<any> {
  const { data } = await supabaseAdmin
    .from('customers')
    .insert({
      name: from.name || from.address,
      email: from.address,
      tier: 'NEW',
    })
    .select()
    .single();

  return data;
}

async function findMessageByExternalId(externalId: string): Promise<any> {
  const { data } = await supabaseAdmin
    .from('communication_messages')
    .select('*')
    .eq('external_id', externalId)
    .single();

  return data;
}

async function sendEmail(data: any): Promise<void> {
  // TODO: Implement email sending with Nodemailer
  logger.info('Sending email', { to: data.to, subject: data.subject });
}

// Schedule inbox polling
setInterval(() => {
  emailQueue.add('POLL_INBOX', { action: 'POLL_INBOX' });
}, EMAIL_POLL_INTERVAL);

logger.info('Email poller worker started');

export default emailWorker;
