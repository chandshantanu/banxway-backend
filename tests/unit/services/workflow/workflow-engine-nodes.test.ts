/**
 * WorkflowEngine Node Tests — SEND_EMAIL and SEND_SMS
 *
 * Tests the private node execution methods for email and SMS dispatch,
 * accessed via (engine as any) to keep the production API unchanged.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowNodeType } from '../../../../src/types/workflow';
import type { WorkflowNode, WorkflowInstance } from '../../../../src/types/workflow';

// ---------------------------------------------------------------------------
// Mock all heavy dependencies before importing WorkflowEngine
// ---------------------------------------------------------------------------

// Logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// database / supabaseAdmin
jest.mock('../../../../src/config/database.config', () => ({
  supabaseAdmin: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null } as never),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
  },
}));

// Exotel telephony & WhatsApp (used by other nodes, not under test)
jest.mock('../../../../src/services/exotel/telephony.service', () => ({
  default: { makeCall: jest.fn() },
}));

jest.mock('../../../../src/services/exotel/whatsapp.service', () => ({
  default: { sendTextMessage: jest.fn() },
}));

// TAT service
jest.mock('../../../../src/services/workflow/tat-service', () => ({
  default: { calculateTATDeadline: jest.fn() },
}));

// Socket.io (io is imported from src/index)
jest.mock('../../../../src/index', () => ({
  io: { emit: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Mocks for the dynamically imported services (import() inside executeNode)
// ---------------------------------------------------------------------------

const mockSendEmail = jest.fn();
const mockSendSMS = jest.fn();

jest.mock('../../../../src/services/email/email-sender.service', () => ({
  __esModule: true,
  default: { sendEmail: mockSendEmail },
}));

jest.mock('../../../../src/services/exotel/sms.service', () => ({
  __esModule: true,
  default: { sendSMS: mockSendSMS },
}));

// ---------------------------------------------------------------------------
// Now import the class under test
// ---------------------------------------------------------------------------
import { WorkflowEngine } from '../../../../src/services/workflow/workflow-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  type: WorkflowNodeType,
  config: Record<string, any>
): WorkflowNode {
  return {
    id: 'node-1',
    type,
    label: 'Test Node',
    position: { x: 0, y: 0 },
    config: config as any,
  };
}

function makeInstance(context: Record<string, any> = {}): WorkflowInstance {
  return {
    id: 'inst-1',
    workflowDefinitionId: 'wf-1',
    workflowVersion: 1,
    entityType: 'STANDALONE',
    status: 'IN_PROGRESS',
    currentNodeId: 'node-1',
    currentStepNumber: 0,
    totalSteps: 3,
    context,
    variables: {},
    errors: [],
    executionLog: [],
    startedAt: new Date(),
  } as unknown as WorkflowInstance;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowEngine node execution', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new WorkflowEngine();

    // Default successes for service mocks
    mockSendEmail.mockResolvedValue({
      messageId: '<test@mail.com>',
      accepted: ['to@example.com'],
      rejected: [],
      response: '250 OK',
    } as never);

    mockSendSMS.mockResolvedValue({ status: 'queued' } as never);
  });

  // -------------------------------------------------------------------------
  // SEND_EMAIL node
  // -------------------------------------------------------------------------
  describe('executeSendEmailNode', () => {
    it('sends email with resolved literal "to" and "subject" values', async () => {
      const node = makeNode(WorkflowNodeType.SEND_EMAIL, {
        to: 'customer@example.com',
        subject: 'Your shipment is ready',
        text: 'Please confirm receipt.',
        nextNodeId: 'node-2',
      });

      const result = await (engine as any).executeSendEmailNode(node, makeInstance());

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const callArg = mockSendEmail.mock.calls[0][0] as any;
      expect(callArg.to).toBe('customer@example.com');
      expect(callArg.subject).toBe('Your shipment is ready');
      expect(callArg.text).toBe('Please confirm receipt.');

      expect(result.nextNodeId).toBe('node-2');
      expect(result.output.to).toBe('customer@example.com');
      expect(result.output.messageId).toBe('<test@mail.com>');
    });

    it('resolves {{variable}} template references from instance context', async () => {
      const node = makeNode(WorkflowNodeType.SEND_EMAIL, {
        to: '{{customer.email}}',
        subject: 'Update for {{shipment.id}}',
        text: 'Details inside.',
        nextNodeId: 'node-2',
      });

      const instance = makeInstance({
        customer: { email: 'dynamic@example.com' },
        shipment: { id: 'SHIP-999' },
      });

      await (engine as any).executeSendEmailNode(node, instance);

      const callArg = mockSendEmail.mock.calls[0][0] as any;
      expect(callArg.to).toBe('dynamic@example.com');
      expect(callArg.subject).toBe('Update for SHIP-999');
    });

    it('sends cc when config.cc is provided', async () => {
      const node = makeNode(WorkflowNodeType.SEND_EMAIL, {
        to: 'to@example.com',
        cc: 'manager@example.com',
        subject: 'CC Test',
        html: '<p>Hi</p>',
        nextNodeId: 'node-end',
      });

      await (engine as any).executeSendEmailNode(node, makeInstance());

      const callArg = mockSendEmail.mock.calls[0][0] as any;
      expect(callArg.cc).toBe('manager@example.com');
    });

    it('throws when "to" is missing from node config', async () => {
      const node = makeNode(WorkflowNodeType.SEND_EMAIL, {
        subject: 'No recipient',
        text: 'Oops',
      });

      await expect(
        (engine as any).executeSendEmailNode(node, makeInstance())
      ).rejects.toThrow('SEND_EMAIL node requires a "to" address');

      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('propagates underlying email service errors', async () => {
      mockSendEmail.mockRejectedValue(new Error('SMTP timeout') as never);

      const node = makeNode(WorkflowNodeType.SEND_EMAIL, {
        to: 'to@example.com',
        subject: 'Test',
        text: 'Body',
      });

      await expect(
        (engine as any).executeSendEmailNode(node, makeInstance())
      ).rejects.toThrow('SMTP timeout');
    });
  });

  // -------------------------------------------------------------------------
  // SEND_SMS node
  // -------------------------------------------------------------------------
  describe('executeSendSMSNode', () => {
    it('sends SMS with resolved "to" and "body" values', async () => {
      const node = makeNode(WorkflowNodeType.SEND_SMS, {
        to: '+919999999999',
        body: 'Your order has been dispatched.',
        nextNodeId: 'node-end',
      });

      const result = await (engine as any).executeSendSMSNode(node, makeInstance());

      expect(mockSendSMS).toHaveBeenCalledTimes(1);
      const callArg = mockSendSMS.mock.calls[0][0] as any;
      expect(callArg.to).toBe('+919999999999');
      expect(callArg.body).toBe('Your order has been dispatched.');

      expect(result.nextNodeId).toBe('node-end');
      expect(result.output.to).toBe('+919999999999');
      expect(result.output.status).toBe('queued');
    });

    it('resolves {{variable}} template references from instance context', async () => {
      const node = makeNode(WorkflowNodeType.SEND_SMS, {
        to: '{{customer.phone}}',
        body: 'Shipment {{shipment.trackingId}} is out for delivery.',
        nextNodeId: 'node-end',
      });

      const instance = makeInstance({
        customer: { phone: '+918888888888' },
        shipment: { trackingId: 'TRK-42' },
      });

      await (engine as any).executeSendSMSNode(node, instance);

      const callArg = mockSendSMS.mock.calls[0][0] as any;
      expect(callArg.to).toBe('+918888888888');
      expect(callArg.body).toBe('Shipment TRK-42 is out for delivery.');
    });

    it('uses config.message as fallback when config.body is absent', async () => {
      const node = makeNode(WorkflowNodeType.SEND_SMS, {
        to: '+911234567890',
        message: 'Fallback message body',
        nextNodeId: 'node-end',
      });

      await (engine as any).executeSendSMSNode(node, makeInstance());

      const callArg = mockSendSMS.mock.calls[0][0] as any;
      expect(callArg.body).toBe('Fallback message body');
    });

    it('throws when "to" is missing', async () => {
      const node = makeNode(WorkflowNodeType.SEND_SMS, {
        body: 'Hello!',
      });

      await expect(
        (engine as any).executeSendSMSNode(node, makeInstance())
      ).rejects.toThrow('SEND_SMS node requires a "to" phone number');

      expect(mockSendSMS).not.toHaveBeenCalled();
    });

    it('throws when message body is missing', async () => {
      const node = makeNode(WorkflowNodeType.SEND_SMS, {
        to: '+919999999999',
        body: '',
      });

      await expect(
        (engine as any).executeSendSMSNode(node, makeInstance())
      ).rejects.toThrow('SEND_SMS node requires a message body');

      expect(mockSendSMS).not.toHaveBeenCalled();
    });

    it('propagates underlying SMS service errors', async () => {
      mockSendSMS.mockRejectedValue(new Error('Exotel API error') as never);

      const node = makeNode(WorkflowNodeType.SEND_SMS, {
        to: '+919999999999',
        body: 'Test body',
      });

      await expect(
        (engine as any).executeSendSMSNode(node, makeInstance())
      ).rejects.toThrow('Exotel API error');
    });
  });
});
