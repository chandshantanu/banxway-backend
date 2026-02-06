import { Worker } from 'bullmq';
import { getRedisConnection, getSlaQueue } from '../config/redis.config';
import { logger } from '../utils/logger';
import tatService, { ApproachingDeadline, BreachedDeadline } from '../services/workflow/tat-service';
import notificationRepository from '../database/repositories/notification.repository';
import emailSenderService from '../services/email/email-sender.service';
import exotelSms from '../services/exotel/sms.service';
import exotelWhatsApp from '../services/exotel/whatsapp.service';
import exotelTelephony from '../services/exotel/telephony.service';
import { supabaseAdmin } from '../config/database.config';
import { io } from '../index';

// Get queue (lazy initialization)
const slaQueue = getSlaQueue();

/**
 * Check SLA/TAT deadlines and process warnings and breaches
 */
export async function checkSLADeadlines() {
  logger.info('Checking SLA/TAT deadlines...');

  let warnings = 0;
  let escalations = 0;

  try {
    // 1. Check approaching deadlines (80-100% threshold)
    const approaching = await tatService.getApproachingDeadlines();

    for (const instance of approaching) {
      try {
        // Update TAT status
        if (instance.threadId) {
          await tatService.updateTATStatus(instance.threadId, 'AT_RISK');
        }

        // Create in-app notification
        if (instance.assignedTo) {
          await notificationRepository.create({
            userId: instance.assignedTo,
            type: 'SLA_WARNING',
            title: `TAT Warning: ${instance.workflowName}`,
            message: `${instance.entityType} approaching deadline in ${instance.timeRemaining} minutes`,
            entityType: instance.entityType,
            entityId: instance.entityId,
            priority: 'HIGH',
            actionUrl: `/workflows/${instance.id}`,
          });
        }

        // Send reminders via configured channels
        if (instance.escalationRule && instance.escalationRule.notifyVia) {
          for (const channel of instance.escalationRule.notifyVia) {
            try {
              await sendReminder(channel, instance, instance.escalationRule.escalateTo);
            } catch (error: any) {
              logger.error('Failed to send reminder', {
                channel,
                instanceId: instance.id,
                error: error.message,
              });
              // Continue processing other channels
            }
          }
        }

        warnings++;
      } catch (error: any) {
        logger.error('Failed to process approaching deadline', {
          instanceId: instance.id,
          error: error.message,
        });
        // Continue processing other instances
      }
    }

    // 2. Check breached deadlines (>100% threshold)
    const breached = await tatService.getBreachedDeadlines();

    for (const instance of breached) {
      try {
        // Update TAT status
        if (instance.threadId) {
          await tatService.updateTATStatus(instance.threadId, 'BREACHED');
        }

        // Create breach notification
        if (instance.assignedTo) {
          await notificationRepository.create({
            userId: instance.assignedTo,
            type: 'SLA_BREACH',
            title: `TAT BREACH: ${instance.workflowName}`,
            message: `${instance.entityType} overdue by ${instance.overdueMinutes} minutes`,
            entityType: instance.entityType,
            entityId: instance.entityId,
            priority: 'CRITICAL',
            actionUrl: `/workflows/${instance.id}`,
          });
        }

        // Trigger escalation workflow if configured
        if (instance.escalationWorkflowId) {
          try {
            const { data: escalationWorkflow, error } = await supabaseAdmin
              .from('workflow_definitions')
              .select('*')
              .eq('id', instance.escalationWorkflowId)
              .eq('status', 'ACTIVE')
              .single();

            if (!error && escalationWorkflow) {
              // Start escalation workflow
              await supabaseAdmin.from('workflow_instances').insert({
                workflow_definition_id: instance.escalationWorkflowId,
                entity_type: instance.entityType,
                entity_id: instance.entityId,
                status: 'IN_PROGRESS',
                context: {
                  originalWorkflowId: instance.id,
                  breachTime: new Date(),
                  overdueMinutes: instance.overdueMinutes,
                },
                started_at: new Date(),
              });

              logger.info('Escalation workflow started', {
                instanceId: instance.id,
                escalationWorkflowId: instance.escalationWorkflowId,
              });
            }
          } catch (error: any) {
            logger.error('Failed to start escalation workflow', {
              instanceId: instance.id,
              error: error.message,
            });
          }
        }

        // Send escalation notifications
        if (instance.escalationRule && instance.escalationRule.notifyVia) {
          for (const channel of instance.escalationRule.notifyVia) {
            try {
              await sendEscalation(channel, instance, instance.escalationRule.escalateTo);
            } catch (error: any) {
              logger.error('Failed to send escalation', {
                channel,
                instanceId: instance.id,
                error: error.message,
              });
            }
          }
        }

        escalations++;
      } catch (error: any) {
        logger.error('Failed to process breached deadline', {
          instanceId: instance.id,
          error: error.message,
        });
      }
    }

    // 3. Emit WebSocket events for real-time updates
    io.emit('sla:check:completed', {
      warnings,
      escalations,
      timestamp: new Date(),
    });

    logger.info('SLA check completed', { warnings, escalations });

    return {
      checked: approaching.length + breached.length,
      warnings,
      escalations,
    };
  } catch (error: any) {
    logger.error('SLA check failed', { error: error.message });
    throw error;
  }
}

/**
 * Send TAT warning reminder via specified channel
 */
export async function sendReminder(
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'CALL',
  instance: ApproachingDeadline,
  recipients: string[]
) {
  const message = `Reminder: ${instance.workflowName} for ${instance.entityType} ${instance.entityId} is approaching TAT deadline in ${instance.timeRemaining} minutes.`;

  for (const recipientId of recipients) {
    try {
      // Fetch user details
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email, phone')
        .eq('id', recipientId)
        .single();

      if (error || !user) {
        logger.warn('User not found for reminder', { recipientId });
        continue;
      }

      switch (channel) {
        case 'EMAIL':
          if (user.email) {
            await emailSenderService.sendEmail({
              to: user.email,
              subject: `TAT Warning: ${instance.workflowName}`,
              body: `
                <h2>TAT Warning</h2>
                <p>Hi ${user.full_name},</p>
                <p>${message}</p>
                <p><strong>Time Remaining:</strong> ${instance.timeRemaining} minutes (${instance.thresholdPercentage}% of TAT)</p>
                <p><strong>Entity Type:</strong> ${instance.entityType}</p>
                <p><strong>Entity ID:</strong> ${instance.entityId}</p>
                <p>Please take immediate action to avoid TAT breach.</p>
                <p><a href="${process.env.FRONTEND_URL}/workflows/${instance.id}">View Workflow</a></p>
              `,
            });
            logger.info('TAT warning email sent', { recipientId, workflowId: instance.id });
          }
          break;

        case 'SMS':
          if (user.phone) {
            await exotelSms.sendSMS({
              to: user.phone,
              message: `TAT Warning: ${instance.workflowName} deadline in ${instance.timeRemaining}min. Check Banxway dashboard.`,
            });
            logger.info('TAT warning SMS sent', { recipientId, workflowId: instance.id });
          }
          break;

        case 'WHATSAPP':
          if (user.phone) {
            await exotelWhatsApp.sendTextMessage({
              to: user.phone,
              message: `*TAT Warning*\n\n${message}\n\nTime Remaining: ${instance.timeRemaining} minutes\nWorkflow: ${instance.workflowName}\n\nPlease check the dashboard for details.`,
            });
            logger.info('TAT warning WhatsApp sent', { recipientId, workflowId: instance.id });
          }
          break;

        case 'CALL':
          if (user.phone) {
            await exotelTelephony.makeCall({
              from: process.env.EXOTEL_PHONE_NUMBER || '',
              to: user.phone,
              callType: 'OUTBOUND',
            });
            logger.info('TAT warning call initiated', { recipientId, workflowId: instance.id });
          }
          break;
      }
    } catch (error: any) {
      logger.error('Failed to send reminder to recipient', {
        recipientId,
        channel,
        error: error.message,
      });
    }
  }
}

/**
 * Send TAT breach escalation via specified channel
 */
export async function sendEscalation(
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'CALL',
  instance: BreachedDeadline,
  recipients: string[]
) {
  const message = `URGENT: ${instance.workflowName} for ${instance.entityType} ${instance.entityId} has BREACHED TAT by ${instance.overdueMinutes} minutes.`;

  for (const recipientId of recipients) {
    try {
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email, phone')
        .eq('id', recipientId)
        .single();

      if (error || !user) {
        logger.warn('User not found for escalation', { recipientId });
        continue;
      }

      switch (channel) {
        case 'EMAIL':
          if (user.email) {
            await emailSenderService.sendEmail({
              to: user.email,
              subject: `🚨 TAT BREACH: ${instance.workflowName}`,
              body: `
                <h2 style="color: #d32f2f;">TAT BREACH - IMMEDIATE ACTION REQUIRED</h2>
                <p>Hi ${user.full_name},</p>
                <p><strong>${message}</strong></p>
                <p><strong>Overdue By:</strong> ${instance.overdueMinutes} minutes</p>
                <p><strong>Entity Type:</strong> ${instance.entityType}</p>
                <p><strong>Entity ID:</strong> ${instance.entityId}</p>
                <p><strong>Started At:</strong> ${instance.startedAt.toISOString()}</p>
                <p>This requires immediate escalation and resolution.</p>
                <p><a href="${process.env.FRONTEND_URL}/workflows/${instance.id}" style="background: #d32f2f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Workflow Now</a></p>
              `,
            });
            logger.info('TAT breach email sent', { recipientId, workflowId: instance.id });
          }
          break;

        case 'SMS':
          if (user.phone) {
            await exotelSms.sendSMS({
              to: user.phone,
              message: `URGENT: ${instance.workflowName} BREACHED TAT by ${instance.overdueMinutes}min. Immediate action required!`,
            });
            logger.info('TAT breach SMS sent', { recipientId, workflowId: instance.id });
          }
          break;

        case 'WHATSAPP':
          if (user.phone) {
            await exotelWhatsApp.sendTextMessage({
              to: user.phone,
              message: `🚨 *TAT BREACH - URGENT*\n\n${message}\n\nOverdue By: ${instance.overdueMinutes} minutes\nWorkflow: ${instance.workflowName}\n\n*IMMEDIATE ACTION REQUIRED*\nPlease escalate this to your manager immediately.`,
            });
            logger.info('TAT breach WhatsApp sent', { recipientId, workflowId: instance.id });
          }
          break;

        case 'CALL':
          if (user.phone) {
            await exotelTelephony.makeCall({
              from: process.env.EXOTEL_PHONE_NUMBER || '',
              to: user.phone,
              callType: 'OUTBOUND',
            });
            logger.info('TAT breach call initiated', { recipientId, workflowId: instance.id });
          }
          break;
      }
    } catch (error: any) {
      logger.error('Failed to send escalation to recipient', {
        recipientId,
        channel,
        error: error.message,
      });
    }
  }
}

// Worker to check SLA deadlines
const slaWorker = new Worker(
  'sla-checker',
  async (job) => {
    return await checkSLADeadlines();
  },
  { connection: getRedisConnection() }
);

slaWorker.on('completed', (job, result) => {
  logger.info('SLA check completed', { result });
});

slaWorker.on('failed', (job, error) => {
  logger.error('SLA check failed', { error: error.message });
});

// Schedule SLA checks every 5 minutes
setInterval(() => {
  slaQueue.add('CHECK_SLA', {});
}, 300000); // 5 minutes

logger.info('SLA checker worker started');

export default slaWorker;
