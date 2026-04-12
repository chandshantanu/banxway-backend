import { Worker } from 'bullmq';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { getRedisConnection, getEmailQueue } from '../config/redis.config';
import { parseEmailBuffer, findReferenceInSubject } from '../utils/email-parser';
import threadRepository from '../database/repositories/thread.repository';
import emailAccountRepository, { EmailAccountDecrypted } from '../database/repositories/email-account.repository';
import emailAccountService from '../services/email/email-account.service';
import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';
import { Channel, MessageDirection, ThreadType } from '../types';
import { io } from '../index';
import { publishToKafka, KAFKA_TOPICS } from '../config/kafka.config';
import { blobStorage, CONTAINERS, BlobStorageService } from '../services/storage/blob-storage.service';
import { queueAgentResult } from './agent-result.worker';

// Get Redis connection and queue (lazy initialization)
const emailQueue = getEmailQueue();

// Cache email account lookups for 2 minutes to avoid hammering the DB
// during backlog processing (hundreds of emails, same account ID each time).
const accountCache = new Map<string, { data: any; expiresAt: number }>();
async function getCachedAccount(accountId: string): Promise<any> {
  const hit = accountCache.get(accountId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const { data } = await supabaseAdmin.from('email_accounts').select('*').eq('id', accountId).single();
  accountCache.set(accountId, { data, expiresAt: Date.now() + 2 * 60 * 1000 });
  return data;
}

// Worker to process email jobs
// concurrency: 10 — allows up to 10 PROCESS_EMAIL jobs to run in parallel, which
// prevents a large batch of emails from blocking POLL_ALL_INBOXES / POLL_INBOX jobs.
// POLL jobs use priority: 1 (highest in BullMQ) so they always jump ahead of
// PROCESS_EMAIL jobs in the queue.
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
        logger.warn('Skipping email job with unknown action (stale queue entry)', { action, jobId: job.id });
        return;
    }
  },
  { connection: getRedisConnection(), concurrency: 4 }
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
    logger.info('🔍 Checking for email accounts to poll...');

    const accounts = await emailAccountService.getPollingAccounts();

    if (accounts.length === 0) {
      logger.info('ℹ️  No email accounts configured for polling');
      return;
    }

    logger.info(`📬 Polling ${accounts.length} email inbox(es)...`, {
      accountIds: accounts.map(a => a.id),
      emails: accounts.map(a => a.email),
    });

    // Queue individual poll jobs for each account.
    // jobId: per-account singleton → prevents duplicate concurrent polling of the same inbox.
    // priority: 1 (highest) → POLL_INBOX runs before any queued PROCESS_EMAIL jobs.
    // removeOnComplete: true → frees the per-account jobId immediately so the next
    //   poll cycle can schedule it again without being blocked by the completed state.
    for (const account of accounts) {
      await emailQueue.add('POLL_INBOX', {
        action: 'POLL_INBOX',
        data: { accountId: account.id },
      }, {
        jobId: `poll-inbox-${account.id}`,
        priority: 1,
        removeOnComplete: true,
        removeOnFail: 3,
      }).catch(err => {
        if (!err?.message?.includes('already') && !err?.message?.includes('duplicate') && !err?.message?.includes('Duplicate')) {
          logger.warn('Failed to queue POLL_INBOX job', { accountId: account.id, error: err.message });
        }
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
  logger.info('📧 Starting email poll for account', { accountId });

  const account = await emailAccountService.getAccountWithCredentials(accountId);

  if (!account) {
    logger.error('❌ Email account not found for polling', { accountId });
    return;
  }

  if (!account.imap_enabled) {
    logger.info('⏭️  IMAP polling disabled for account', { accountId, email: account.email });
    return;
  }

  logger.info('🔄 Connecting to IMAP inbox', {
    accountId,
    email: account.email,
    host: account.imap_host,
    port: account.imap_port,
  });

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

        // Calculate date for configured sync days (default 30 to catch all emails)
        const syncDays = parseInt(process.env.EMAIL_SYNC_DAYS || '30');
        const syncLimit = parseInt(process.env.EMAIL_SYNC_LIMIT || '500');
        const syncDate = new Date();
        syncDate.setDate(syncDate.getDate() - syncDays);

        // Format date as DD-MMM-YYYY for IMAP (e.g., "05-Feb-2026")
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = syncDate.getDate().toString().padStart(2, '0');
        const month = monthNames[syncDate.getMonth()];
        const year = syncDate.getFullYear();
        const sinceDate = `${day}-${month}-${year}`;

        // Search for ALL emails from last N days (real-time sync)
        // Database UNIQUE constraint on external_id prevents duplicate processing
        // markSeen: false keeps emails unread in inbox
        imap.search([['SINCE', sinceDate]], (err, results) => {
          if (err) {
            logger.error('Error searching emails', { accountId, error: err.message });
            emailAccountService.updatePollStatus(accountId, 'FAILED', err.message);
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            logger.debug(`No new emails found in last ${syncDays} days`, { accountId, email: account.email });
            emailAccountService.updatePollStatus(accountId, 'SUCCESS');
            imap.end();
            resolve();
            return;
          }

          logger.info(`Found ${results.length} email(s) in last ${syncDays} days (real-time sync)`, { accountId, email: account.email });

          // Limit to most recent N emails to avoid overwhelming the system
          const emailsToFetch = results.slice(-syncLimit);
          if (results.length > syncLimit) {
            logger.info(`Limiting to most recent ${syncLimit} emails (total: ${results.length})`, { accountId });
          }

          const fetch = imap.fetch(emailsToFetch, { bodies: '', markSeen: false });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
              stream.once('end', () => {
                // Extract Message-ID header for BullMQ deduplication
                // This prevents queuing the same email multiple times across poll cycles
                const msgIdMatch = buffer.match(/^Message-ID:\s*(<[^>\r\n]+>)/mi);
                const rawExternalId = msgIdMatch?.[1]?.trim();

                // BullMQ jobIds cannot contain ':', '<', '>', '@' or other special chars.
                // Strip angle brackets and replace disallowed characters with safe equivalents.
                const safeJobId = rawExternalId
                  ? `email_${rawExternalId.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9._@-]/g, '_')}`
                  : undefined;

                // Queue email processing with account context
                // NOTE: emailQueue.add() returns a Promise — must .catch() here because
                // we're inside an event handler that cannot be made async.
                // Without .catch(), Redis errors or duplicate-key conflicts become
                // unhandled rejections and can crash the worker process.
                emailQueue.add('PROCESS_EMAIL', {
                  action: 'PROCESS_EMAIL',
                  data: { emailBuffer: buffer, accountId: account.id },
                }, {
                  ...(safeJobId ? { jobId: safeJobId } : {}),
                  removeOnComplete: 10,
                  removeOnFail: 3,
                }).catch(err => {
                  // BullMQ throws on duplicate jobId (already queued/processing) — this is normal
                  if (err?.message?.includes('already') || err?.message?.includes('duplicate') || err?.message?.includes('Duplicate')) {
                    logger.debug('Email already queued (duplicate jobId skipped)', { rawExternalId });
                  } else {
                    logger.error('Failed to enqueue PROCESS_EMAIL job', {
                      rawExternalId,
                      accountId: account.id,
                      error: err.message,
                    });
                  }
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
            logger.info('Email fetch completed', {
              accountId,
              email: account.email,
              fetched: emailsToFetch.length,
              total: results.length
            });
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
    logger.info('📨 Processing email from buffer', { accountId, bufferSize: emailBuffer.length });

    const parsed = await parseEmailBuffer(Buffer.from(emailBuffer));

    // Get the email account for context (cached — same account hit on every email in backlog)
    const account = await getCachedAccount(accountId);

    logger.info('✉️  Email parsed successfully', {
      accountId,
      accountEmail: account?.email,
      from: parsed.from.address,
      to: parsed.to,
      subject: parsed.subject,
      messageId: parsed.messageId,
      hasAttachments: (parsed.attachments?.length || 0) > 0,
    });

    // Check if message already exists (avoid duplicates)
    if (parsed.messageId) {
      const existingMessage = await findMessageByExternalId(parsed.messageId);
      if (existingMessage) {
        logger.debug('Email already processed, skipping', {
          messageId: parsed.messageId,
          existingId: existingMessage.id,
        });
        return; // Skip this email
      }
    }

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
    // Use ON CONFLICT to handle race conditions
    const uploadedAttachments = await uploadAttachments(parsed.messageId, parsed.attachments);
    const { data: message, error: insertError } = await supabaseAdmin
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
        to_addresses: sanitizeForJsonb(parsed.to ?? []),
        cc_addresses: sanitizeForJsonb(parsed.cc ?? []),
        external_id: parsed.messageId,
        external_thread_id: parsed.inReplyTo,
        attachments: sanitizeForJsonb(uploadedAttachments),
        email_account_id: accountId,
      })
      .select()
      .single();

    // Handle duplicate key error (23505 = unique violation)
    if (insertError) {
      if (insertError.code === '23505') {
        logger.info('⏭️  Duplicate email skipped (already in database)', {
          messageId: parsed.messageId,
          from: parsed.from.address,
          subject: parsed.subject,
        });
        return; // Skip silently
      }
      logger.error('❌ Failed to insert email into database', {
        error: insertError.message,
        code: insertError.code,
      });
      throw insertError; // Re-throw other errors
    }

    if (message) {
      // Increment message counts on thread atomically
      await supabaseAdmin.rpc('increment_thread_message_count', {
        p_thread_id: thread.id,
        p_is_inbound: true,
      });

      logger.info('✅ Email processed and saved successfully', {
        threadId: thread.id,
        messageId: message.id,
        accountId,
        from: parsed.from.address,
        subject: parsed.subject,
      });

      // Trigger correlation engine: link thread to CRM customer, classify new lead vs existing.
      // Non-fatal — email is already saved even if correlation fails.
      queueAgentResult({
        resultType: 'correlation_complete',
        agentId: 'email-poller-native',
        entityId: thread.id,
        payload: {
          threadId: thread.id,
          messageId: message.id,
          fromEmail: parsed.from.address,
          fromName: parsed.from.name || '',
        },
      }).catch((err: any) => {
        logger.warn('Failed to queue correlation job (non-fatal)', {
          threadId: thread.id, error: err.message,
        });
      });

      // Emit WebSocket event
      io.to(`thread:${thread.id}`).emit('thread:message', {
        threadId: thread.id,
        message: message,
      });

      // Emit to inbox for real-time updates
      io.emit('inbox:new-message', {
        threadId: thread.id,
        message: message,
        account: account ? { id: account.id, name: account.name, email: account.email } : null,
      });

      // Publish to Kafka for L1 agent pipeline processing.
      // Non-fatal: email is already saved to DB and visible in inbox.
      // Kafka is for downstream AI agent processing only — failures here
      // must NOT fail the job or prevent the email from appearing in the UI.
      publishToKafka(KAFKA_TOPICS.EMAIL_RAW, {
        messageId: message.id,
        threadId: thread.id,
        channel: 'EMAIL',
        direction: 'INBOUND',
        from: parsed.from.address,
        fromName: parsed.from.name,
        to: parsed.to,
        subject: parsed.subject,
        content: parsed.text,
        htmlContent: parsed.html,
        attachments: parsed.attachments?.map((a: any) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
        customerId: customer?.id,
        accountId,
        timestamp: new Date().toISOString(),
      }, thread.id).catch((kafkaErr: any) => {
        logger.warn('Failed to publish email to Kafka (non-fatal — email saved to DB)', {
          messageId: message.id,
          error: kafkaErr.message,
        });
      });
    }
  } catch (error: any) {
    logger.error('Error processing email', { accountId, error: error.message });
    throw error;
  }
}

/**
 * Strip null bytes from strings so PostgreSQL JSONB columns accept the data.
 * Malformed emails can include \u0000 in filenames, content-types, or addresses.
 */
function sanitizeForJsonb(value: any): any {
  if (typeof value === 'string') return value.replace(/\u0000/g, '');
  if (Array.isArray(value)) return value.map(sanitizeForJsonb);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeForJsonb(v);
    }
    return out;
  }
  return value;
}

/**
 * Upload email attachments to Azure Blob Storage.
 * Returns attachment metadata with blob URLs instead of raw buffers.
 * Non-fatal: if blob upload fails, falls back to storing attachment metadata only.
 */
async function uploadAttachments(messageId: string, attachments: any[]): Promise<any[]> {
  if (!attachments || attachments.length === 0) return [];

  return Promise.all(
    attachments.map(async (a: any) => {
      const base = { filename: a.filename, contentType: a.contentType, size: a.size };
      if (!a.content) return base;
      try {
        const blobName = BlobStorageService.emailAttachmentName(messageId, a.filename || 'attachment');
        const url = await blobStorage.upload(
          CONTAINERS.EMAIL_ATTACHMENTS,
          blobName,
          Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
          a.contentType || 'application/octet-stream'
        );
        return { ...base, url };
      } catch (err: any) {
        logger.warn('Failed to upload email attachment to blob storage (non-fatal)', {
          filename: a.filename, error: err.message,
        });
        return base;
      }
    })
  );
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
  const {
    accountId,
    threadId,
    to,
    cc,
    bcc,
    subject,
    body,
    html,
    attachments,
    inReplyTo,
    references,
    messageId,
  } = data;

  try {
    // Get email account with decrypted credentials
    const account = await emailAccountService.getAccountWithCredentials(accountId);

    if (!account) {
      throw new Error(`Email account not found: ${accountId}`);
    }

    // Create transporter for this specific account
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_secure,
      auth: {
        user: account.smtp_user,
        pass: account.smtp_password,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });

    // Prepare email options
    const mailOptions = {
      from: `"${account.name || account.email}" <${account.email}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
      subject,
      text: body,
      html: html || body,
      attachments,
      inReplyTo,
      references,
      replyTo: account.email,
    };

    // Append signature if configured
    if (account.signature_html && html) {
      mailOptions.html = `${html}<br/><br/>${account.signature_html}`;
    } else if (account.signature_text && body) {
      mailOptions.text = `${body}\n\n${account.signature_text}`;
    }

    // Send email
    const result = await transporter.sendMail(mailOptions);

    // Update message record with external ID (Message-ID from sent email)
    await supabaseAdmin
      .from('communication_messages')
      .update({
        external_id: result.messageId,
        status: 'SENT',
        sent_at: new Date().toISOString(),
        metadata: {
          envelope: result.envelope,
          response: result.response,
        },
      })
      .eq('id', messageId);

    // Emit WebSocket event
    io.to(`thread:${threadId}`).emit('message:sent', {
      messageId,
      threadId,
      externalId: result.messageId,
    });

    logger.info('Email sent successfully', {
      messageId,
      to,
      subject,
      accountEmail: account.email,
      externalId: result.messageId,
    });

    // Close transporter
    transporter.close();
  } catch (error: any) {
    logger.error('Failed to send email', {
      error: error.message,
      messageId,
      accountId,
    });

    // Update message status to failed
    await supabaseAdmin
      .from('communication_messages')
      .update({
        status: 'FAILED',
        error_message: error.message,
        failed_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    throw error;
  }
}

// Configuration - Real-time sync
const POLL_INTERVAL = parseInt(process.env.EMAIL_POLL_INTERVAL || '60000'); // 60s default — balance between real-time and DB load
const EMAIL_SYNC_DAYS = parseInt(process.env.EMAIL_SYNC_DAYS || '30'); // Sync last 30 days to catch all emails
const EMAIL_SYNC_LIMIT = parseInt(process.env.EMAIL_SYNC_LIMIT || '500'); // Limit to 500 emails per poll

// AUTO-POLLING ENABLED
// Use singleton jobId to prevent concurrent poll storms:
// BullMQ will not enqueue a new POLL_ALL_INBOXES if one is already waiting/active.
// On startup, clear any stuck failed/delayed singleton job so polling resumes immediately
// rather than waiting for an exponential backoff delay (which can be hours long).
async function clearStuckSingleton(): Promise<void> {
  try {
    const existingJob = await emailQueue.getJob('poll-all-inboxes-singleton');
    if (existingJob) {
      const state = await existingJob.getState();
      // Remove any non-active singleton on startup so the fresh instance can schedule cleanly.
      // 'active' jobs should not be interrupted — they are currently being processed.
      if (state !== 'active') {
        logger.info(`Clearing singleton poll job on startup (state: ${state}) to resume polling`);
        await existingJob.remove();
      }
    }
  } catch (err: any) {
    logger.warn('Could not check/clear singleton poll job', { error: err.message });
  }

  // Also clear any stuck per-account POLL_INBOX jobs from previous deployments.
  // These become stuck (failed/stalled) when the container restarts mid-poll, leaving
  // the jobId occupied and blocking new POLL_INBOX jobs from being queued.
  try {
    const stuckStates = ['waiting', 'delayed', 'failed'] as const;
    for (const state of stuckStates) {
      const jobs = await emailQueue.getJobs([state], 0, 200);
      for (const job of jobs) {
        if (job.id?.startsWith('poll-inbox-') || job.id?.startsWith('poll-all-inboxes')) {
          logger.info(`Clearing stuck ${state} poll job on startup`, { jobId: job.id });
          await job.remove().catch(() => {});
        }
      }
    }
  } catch (err: any) {
    logger.warn('Could not clear stuck per-account poll jobs', { error: err.message });
  }
}

function schedulePollAllInboxes() {
  // removeOnComplete: true → job is deleted from Redis immediately on success,
  // freeing the singleton jobId so the next setInterval tick can add a new one.
  // removeOnComplete: N (keeping N completed jobs) blocks re-scheduling because BullMQ
  // treats the "completed" state as still "owned" by that jobId.
  emailQueue.add('POLL_ALL_INBOXES', {
    action: 'POLL_ALL_INBOXES',
  }, {
    jobId: 'poll-all-inboxes-singleton',
    priority: 1,
    removeOnComplete: true,
    removeOnFail: 3,
  }).catch(err => {
    // Duplicate jobId is expected when a poll is already queued/active — not an error
    if (!err?.message?.includes('already') && !err?.message?.includes('duplicate') && !err?.message?.includes('Duplicate')) {
      logger.warn('Failed to schedule poll-all-inboxes job', { error: err.message });
    }
  });
}

setInterval(schedulePollAllInboxes, POLL_INTERVAL);

// Initial poll on startup: clear any stuck singleton first, then poll after 10s
clearStuckSingleton().then(() => {
  setTimeout(schedulePollAllInboxes, 10000);
});

logger.info('Email poller worker started - REAL-TIME SYNC MODE', {
  pollInterval: `${POLL_INTERVAL}ms (${POLL_INTERVAL / 1000}s)`,
  syncDays: EMAIL_SYNC_DAYS,
  syncLimit: EMAIL_SYNC_LIMIT,
  syncMode: 'ALL emails (not just UNSEEN)',
  redisTier: 'Standard C1 (1GB)',
  jobRetention: { completed: 10, failed: 5 }
});

export default emailWorker;
