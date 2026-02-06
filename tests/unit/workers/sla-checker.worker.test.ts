import tatService from '../../../src/services/workflow/tat-service';
import notificationRepository from '../../../src/database/repositories/notification.repository';
import emailSenderService from '../../../src/services/email/email-sender.service';
import exotelSms from '../../../src/services/exotel/sms.service';
import exotelWhatsApp from '../../../src/services/exotel/whatsapp.service';
import exotelTelephony from '../../../src/services/exotel/telephony.service';

// Mock dependencies
jest.mock('../../../src/services/workflow/tat-service');
jest.mock('../../../src/database/repositories/notification.repository');
jest.mock('../../../src/services/email/email-sender.service');
jest.mock('../../../src/services/exotel/sms.service');
jest.mock('../../../src/services/exotel/whatsapp.service');
jest.mock('../../../src/services/exotel/telephony.service');
jest.mock('../../../src/utils/logger');

describe('SLA Checker Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSLADeadlines', () => {
    it('should process approaching deadlines and send reminders', async () => {
      // Mock approaching deadlines
      const mockApproaching = [
        {
          id: 'instance-1',
          workflowDefinitionId: 'wf-1',
          workflowName: 'Quote Request',
          entityType: 'SHIPMENT',
          entityId: 'shipment-1',
          threadId: 'thread-1',
          assignedTo: 'user-1',
          timeRemaining: 120, // 2 hours
          thresholdPercentage: 15,
          escalationRule: {
            afterMinutes: 1152,
            escalateTo: ['user-1', 'manager-1'],
            notifyVia: ['EMAIL', 'WHATSAPP'],
          },
          startedAt: new Date('2026-02-06T08:00:00Z'),
        },
      ];

      (tatService.getApproachingDeadlines as jest.Mock).mockResolvedValue(mockApproaching);
      (tatService.updateTATStatus as jest.Mock).mockResolvedValue(undefined);
      (notificationRepository.create as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        type: 'SLA_WARNING',
      });
      (emailSenderService.sendEmail as jest.Mock).mockResolvedValue(true);
      (exotelWhatsApp.sendTextMessage as jest.Mock).mockResolvedValue(true);

      // Import and execute worker logic (we'll extract to a function)
      const { checkSLADeadlines } = await import('../../../src/workers/sla-checker.worker');
      const result = await checkSLADeadlines();

      expect(result.warnings).toBe(1);
      expect(tatService.updateTATStatus).toHaveBeenCalledWith('thread-1', 'AT_RISK');
      expect(notificationRepository.create).toHaveBeenCalled();
      expect(emailSenderService.sendEmail).toHaveBeenCalled();
      expect(exotelWhatsApp.sendTextMessage).toHaveBeenCalled();
    });

    it('should process breached deadlines and trigger escalations', async () => {
      // Mock breached deadlines
      const mockBreached = [
        {
          id: 'instance-2',
          workflowDefinitionId: 'wf-2',
          workflowName: 'KYC Verification',
          entityType: 'THREAD',
          entityId: 'thread-2',
          threadId: 'thread-2',
          assignedTo: 'user-2',
          overdueMinutes: 120, // 2 hours overdue
          escalationWorkflowId: 'escalation-wf-1',
          escalationRule: {
            afterMinutes: 1440,
            escalateTo: ['manager-1', 'ops-1'],
            notifyVia: ['EMAIL', 'SMS', 'WHATSAPP', 'CALL'],
          },
          startedAt: new Date('2026-02-05T08:00:00Z'),
        },
      ];

      (tatService.getApproachingDeadlines as jest.Mock).mockResolvedValue([]);
      (tatService.getBreachedDeadlines as jest.Mock).mockResolvedValue(mockBreached);
      (tatService.updateTATStatus as jest.Mock).mockResolvedValue(undefined);
      (notificationRepository.create as jest.Mock).mockResolvedValue({
        id: 'notif-2',
        type: 'SLA_BREACH',
      });

      const { checkSLADeadlines } = await import('../../../src/workers/sla-checker.worker');
      const result = await checkSLADeadlines();

      expect(result.escalations).toBe(1);
      expect(tatService.updateTATStatus).toHaveBeenCalledWith('thread-2', 'BREACHED');
      expect(notificationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SLA_BREACH',
          priority: 'CRITICAL',
        })
      );
    });

    it('should send reminders via multiple channels', async () => {
      const mockApproaching = [
        {
          id: 'instance-3',
          workflowDefinitionId: 'wf-3',
          workflowName: 'Document Validation',
          entityType: 'SHIPMENT',
          entityId: 'shipment-3',
          threadId: 'thread-3',
          assignedTo: 'user-3',
          timeRemaining: 60, // 1 hour
          thresholdPercentage: 10,
          escalationRule: {
            afterMinutes: 1296,
            escalateTo: ['user-3'],
            notifyVia: ['EMAIL', 'SMS', 'WHATSAPP', 'CALL'],
          },
          startedAt: new Date('2026-02-06T09:00:00Z'),
        },
      ];

      (tatService.getApproachingDeadlines as jest.Mock).mockResolvedValue(mockApproaching);
      (tatService.getBreachedDeadlines as jest.Mock).mockResolvedValue([]);
      (tatService.updateTATStatus as jest.Mock).mockResolvedValue(undefined);
      (notificationRepository.create as jest.Mock).mockResolvedValue({ id: 'notif-3' });
      (emailSenderService.sendEmail as jest.Mock).mockResolvedValue(true);
      (exotelSms.sendSMS as jest.Mock).mockResolvedValue(true);
      (exotelWhatsApp.sendTextMessage as jest.Mock).mockResolvedValue(true);
      (exotelTelephony.makeCall as jest.Mock).mockResolvedValue({ id: 'call-1' });

      const { checkSLADeadlines } = await import('../../../src/workers/sla-checker.worker');
      await checkSLADeadlines();

      expect(emailSenderService.sendEmail).toHaveBeenCalled();
      expect(exotelSms.sendSMS).toHaveBeenCalled();
      expect(exotelWhatsApp.sendTextMessage).toHaveBeenCalled();
      expect(exotelTelephony.makeCall).toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue processing', async () => {
      const mockApproaching = [
        {
          id: 'instance-4',
          workflowDefinitionId: 'wf-4',
          workflowName: 'Rate Quote',
          entityType: 'THREAD',
          entityId: 'thread-4',
          threadId: 'thread-4',
          assignedTo: 'user-4',
          timeRemaining: 30,
          thresholdPercentage: 5,
          escalationRule: {
            afterMinutes: 1320,
            escalateTo: ['user-4'],
            notifyVia: ['EMAIL'],
          },
          startedAt: new Date('2026-02-06T09:30:00Z'),
        },
      ];

      (tatService.getApproachingDeadlines as jest.Mock).mockResolvedValue(mockApproaching);
      (tatService.getBreachedDeadlines as jest.Mock).mockResolvedValue([]);
      (tatService.updateTATStatus as jest.Mock).mockResolvedValue(undefined);
      (notificationRepository.create as jest.Mock).mockResolvedValue({ id: 'notif-4' });

      // Email service fails
      (emailSenderService.sendEmail as jest.Mock).mockRejectedValue(
        new Error('SMTP connection failed')
      );

      const { checkSLADeadlines } = await import('../../../src/workers/sla-checker.worker');
      const result = await checkSLADeadlines();

      // Should still count as warning even if email failed
      expect(result.warnings).toBe(1);
      expect(tatService.updateTATStatus).toHaveBeenCalled();
    });

    it('should return zeros if no approaching or breached deadlines', async () => {
      (tatService.getApproachingDeadlines as jest.Mock).mockResolvedValue([]);
      (tatService.getBreachedDeadlines as jest.Mock).mockResolvedValue([]);

      const { checkSLADeadlines } = await import('../../../src/workers/sla-checker.worker');
      const result = await checkSLADeadlines();

      expect(result).toEqual({
        checked: 0,
        warnings: 0,
        escalations: 0,
      });
    });
  });

  describe('sendReminder', () => {
    it('should send EMAIL reminder with correct template', async () => {
      const { sendReminder } = await import('../../../src/workers/sla-checker.worker');

      (emailSenderService.sendEmail as jest.Mock).mockResolvedValue(true);

      await sendReminder('EMAIL', {
        id: 'instance-1',
        workflowName: 'Quote Request',
        entityType: 'SHIPMENT',
        entityId: 'shipment-1',
        timeRemaining: 120,
      }, ['user-1']);

      expect(emailSenderService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('TAT Warning'),
          body: expect.stringContaining('Quote Request'),
        })
      );
    });

    it('should send SMS reminder with concise message', async () => {
      const { sendReminder } = await import('../../../src/workers/sla-checker.worker');

      (exotelSms.sendSMS as jest.Mock).mockResolvedValue(true);

      await sendReminder('SMS', {
        id: 'instance-2',
        workflowName: 'KYC Verification',
        entityType: 'THREAD',
        entityId: 'thread-2',
        timeRemaining: 60,
      }, ['user-2']);

      expect(exotelSms.sendSMS).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('KYC Verification'),
        })
      );
    });
  });
});
