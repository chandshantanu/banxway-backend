import { Worker } from 'bullmq';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { redisConnection, emailQueue } from '../config/redis.config';
import { parseEmailBuffer, findReferenceInSubject } from '../utils/email-parser';
import threadRepository from '../database/repositories/thread.repository';
import emailAccountRepository, { EmailAccountDecrypted } from '../database/repositories/email-account.repository';
import emailAccountService from '../services/email/email-account.service';
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
      case 'POLL_ALL_INBOXES':
        return await pollAllInboxes();

      case 'POLL_INBOX':
        return await pollInbox(data.accountId);

      case 'PROCESS_EMAIL':
        return await processEmail(data.emailBuffer, data.accountId);

      case 'SEND_EMAIL':
        return await sendEmail(data);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
  { connection: redisConnection }
);

emailWorker.on('completed', (job) => {
  if (job.data.action !== 'POLL_ALL_INBOXES') {
    logger.info('Email job completed', { jobId: job.id, action: job.data.action });
  }
});

emailWorker.on('failed', (job, error) => {
  logger.error('Email job failed', {
    jobId: job?.id,
    action: job?.data.action,
    error: error.message,
  });
});

/**
 * Poll all configured email inboxes
 */
async function pollAllInboxes(): Promise<void> {
  try {
    const accounts = await emailAccountService.getPollingAccounts();

    if (accounts.length === 0) {
      logger.debug('No email accounts configured for polling');
      return;
    }

    logger.info(`Polling ${accounts.length} email inbox(es)...`);

    // Queue individual poll jobs for each account
    for (const account of accounts) {
      await emailQueue.add('POLL_INBOX', {
        action: 'POLL_INBOX',
        data: { accountId: account.id },
      });
    }
  } catch (error: any) {
    logger.error('Error initiating inbox polling', { error: error.message });
  }
}

/**
 * Poll a specific inbox
 */
async function pollInbox(accountId: string): Promise<void> {
  const account = await emailAccountService.getAccountWithCredentials(accountId);

  if (!account) {
    logger.error('Email account not found for polling', { accountId });
    return;
  }

  if (!account.imap_enabled) {
    logger.debug('IMAP polling disabled for account', { accountId, email: account.email });
    return;
  }

  logger.info('Polling email inbox', { accountId, email: account.email });

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.imap_user,
      password: account.imap_password,
      host: account.imap_host,
      port: account.imap_port,
      tls: account.imap_tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          logger.error('Error opening inbox', { accountId, error: err.message });
          emailAccountService.updatePollStatus(accountId, 'FAILED', err.message);
          reject(err);
          return;
        }

        // Search for unseen emails
        imap.search(['UNSEEN'], (err, results) => {
          if (err) {
            logger.error('Error searching emails', { accountId, error: err.message });
            emailAccountService.updatePollStatus(accountId, 'FAILED', err.message);
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            logger.debug('No new emails', { accountId, email: account.email });
            emailAccountService.updatePollStatus(accountId, 'SUCCESS');
            imap.end();
            resolve();
            return;
          }

          logger.info(`Found ${results.length} new email(s)`, { accountId, email: account.email });

          const fetch = imap.fetch(results, { bodies: '', markSeen: true });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', () => {
                // Queue email processing with account context
                emailQueue.add('PROCESS_EMAIL', {
                  action: 'PROCESS_EMAIL',
                  data: { emailBuffer: buffer, accountId: account.id },
                });
              });
            });
          });

          fetch.once('error', (err) => {
            logger.error('Fetch error', { accountId, error: err.message });
            emailAccountService.updatePollStatus(accountId, 'FAILED', err.message);
            reject(err);
          });

          fetch.once('end', () => {
            logger.info('Email fetch completed', { accountId, email: account.email });
            emailAccountService.updatePollStatus(accountId, 'SUCCESS');
            imap.end();
            resolve();
          });
        });
      });
    });

    imap.once('error', (err) => {
      logger.error('IMAP error', { accountId, email: account.email, error: err.message });
      emailAccountService.updatePollStatus(accountId, 'FAILED', err.message);
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Process individual email
 */
async function processEmail(emailBuffer: string, accountId: string): Promise<void> {
  try {
    const parsed = await parseEmailBuffer(Buffer.from(emailBuffer));

    // Get the email account for context
    const account = await emailAccountRepository.findById(accountId);

    logger.info('Processing email', {
      accountId,
      accountEmail: account?.email,
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
      const newThreadData: any = {
        type: ThreadType.QUERY,
        customer_id: customer.id,
        primary_channel: Channel.EMAIL,
      };

      // Link to email account if available
      if (account) {
        newThreadData.email_account_id = account.id;

        // Apply default tags from account
        if (account.default_tags && account.default_tags.length > 0) {
          newThreadData.tags = account.default_tags;
        }
      }

      thread = await threadRepository.create(newThreadData, customer.id);

      // Auto-assign if configured
      if (account?.auto_assign_to) {
        await threadRepository.update(thread.id, { assigned_to: account.auto_assign_to });
      }
    }

    // Create message with email account reference
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
        email_account_id: accountId,
      })
      .select()
      .single();

    if (message.data) {
      logger.info('Email processed successfully', {
        threadId: thread.id,
        messageId: message.data.id,
        accountId,
      });

      // Emit WebSocket event
      io.to(`thread:${thread.id}`).emit('thread:message', {
        threadId: thread.id,
        message: message.data,
      });

      // Emit to inbox for real-time updates
      io.emit('inbox:new-message', {
        threadId: thread.id,
        message: message.data,
        account: account ? { id: account.id, name: account.name, email: account.email } : null,
      });
    }
  } catch (error: any) {
    logger.error('Error processing email', { accountId, error: error.message });
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
  // TODO: Implement email sending with specific account
  logger.info('Sending email', { to: data.to, subject: data.subject, accountId: data.accountId });
}

// Schedule polling for all inboxes
const POLL_INTERVAL = parseInt(process.env.EMAIL_POLL_INTERVAL || '30000');

setInterval(() => {
  emailQueue.add('POLL_ALL_INBOXES', { action: 'POLL_ALL_INBOXES' });
}, POLL_INTERVAL);

// Initial poll on startup
setTimeout(() => {
  emailQueue.add('POLL_ALL_INBOXES', { action: 'POLL_ALL_INBOXES' });
}, 5000);

logger.info('Email poller worker started (multi-account mode)', { pollInterval: POLL_INTERVAL });

export default emailWorker;
