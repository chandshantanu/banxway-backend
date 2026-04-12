/**
 * EmailSenderService Unit Tests
 *
 * Tests for the email sending service with mocked nodemailer transport.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock nodemailer before importing the service
const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockTransporter = {
  sendMail: mockSendMail,
  verify: mockVerify,
};

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => mockTransporter),
  },
}));

// Mock the logger to avoid noise in tests
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocks are set up
import { EmailSenderService } from '../../../../src/services/email/email-sender.service';

describe('EmailSenderService', () => {
  let service: EmailSenderService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: verify succeeds
    mockVerify.mockResolvedValue(true as never);

    // Default: sendMail returns a success info object
    mockSendMail.mockResolvedValue({
      messageId: '<test-message-id@example.com>',
      accepted: ['recipient@example.com'],
      rejected: [],
      response: '250 OK',
    } as never);

    service = new EmailSenderService();
  });

  describe('sendEmail', () => {
    it('sends email with required fields (to, subject, text)', async () => {
      const result = await service.sendEmail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Hello, this is a test.',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0] as any;
      expect(callArgs.to).toBe('recipient@example.com');
      expect(callArgs.subject).toBe('Test Subject');
      expect(callArgs.text).toBe('Hello, this is a test.');

      expect(result).toMatchObject({
        messageId: '<test-message-id@example.com>',
        accepted: ['recipient@example.com'],
        rejected: [],
      });
    });

    it('sends email with cc and html', async () => {
      await service.sendEmail({
        to: 'recipient@example.com',
        cc: 'cc@example.com',
        subject: 'HTML Email',
        html: '<p>Hello</p>',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0] as any;
      expect(callArgs.cc).toBe('cc@example.com');
      expect(callArgs.html).toBe('<p>Hello</p>');
    });

    it('sends email to multiple recipients joined as string', async () => {
      await service.sendEmail({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Multi-recipient',
        text: 'Test',
      });

      const callArgs = mockSendMail.mock.calls[0][0] as any;
      expect(callArgs.to).toBe('a@example.com, b@example.com');
    });

    it('handles SMTP send failure gracefully by throwing', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused') as never);

      await expect(
        service.sendEmail({
          to: 'recipient@example.com',
          subject: 'Test',
          text: 'Test body',
        })
      ).rejects.toThrow('Failed to send email: SMTP connection refused');
    });

    it('returns messageId, accepted, rejected and response from transporter', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<abc123@mail.example.com>',
        accepted: ['user@test.com'],
        rejected: ['bad@test.com'],
        response: '250 Message queued',
      } as never);

      const result = await service.sendEmail({
        to: 'user@test.com',
        subject: 'Check response',
        text: 'Body',
      });

      expect(result.messageId).toBe('<abc123@mail.example.com>');
      expect(result.accepted).toEqual(['user@test.com']);
      expect(result.rejected).toEqual(['bad@test.com']);
      expect(result.response).toBe('250 Message queued');
    });
  });

  describe('sendBulkEmails', () => {
    it('processes all emails and returns results array', async () => {
      const emails = [
        { to: 'a@example.com', subject: 'Email 1', text: 'Body 1' },
        { to: 'b@example.com', subject: 'Email 2', text: 'Body 2' },
        { to: 'c@example.com', subject: 'Email 3', text: 'Body 3' },
      ];

      const results = await service.sendBulkEmails(emails, 0);

      expect(mockSendMail).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      results.forEach(r => expect(r.success).toBe(true));
    });

    it('continues processing remaining emails even when one fails', async () => {
      mockSendMail
        .mockResolvedValueOnce({
          messageId: '<msg1>',
          accepted: ['a@example.com'],
          rejected: [],
          response: '250 OK',
        } as never)
        .mockRejectedValueOnce(new Error('SMTP failed') as never)
        .mockResolvedValueOnce({
          messageId: '<msg3>',
          accepted: ['c@example.com'],
          rejected: [],
          response: '250 OK',
        } as never);

      const emails = [
        { to: 'a@example.com', subject: 'S1', text: 'B1' },
        { to: 'fail@example.com', subject: 'S2', text: 'B2' },
        { to: 'c@example.com', subject: 'S3', text: 'B3' },
      ];

      const results = await service.sendBulkEmails(emails, 0);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Failed to send email: SMTP failed');
      expect(results[2].success).toBe(true);
    });
  });

  describe('testConnection', () => {
    it('returns true when SMTP verify succeeds', async () => {
      mockVerify.mockResolvedValue(true as never);
      const result = await service.testConnection();
      expect(result).toBe(true);
    });

    it('returns false when SMTP verify fails', async () => {
      mockVerify.mockRejectedValue(new Error('Connection failed') as never);
      const result = await service.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('isValidEmail (static)', () => {
    it('returns true for valid email addresses', () => {
      expect(EmailSenderService.isValidEmail('user@example.com')).toBe(true);
      expect(EmailSenderService.isValidEmail('user+tag@sub.domain.com')).toBe(true);
    });

    it('returns false for invalid email addresses', () => {
      expect(EmailSenderService.isValidEmail('not-an-email')).toBe(false);
      expect(EmailSenderService.isValidEmail('@nodomain.com')).toBe(false);
      expect(EmailSenderService.isValidEmail('')).toBe(false);
    });
  });
});
