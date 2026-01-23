import {
  WorkflowTemplate,
  WorkflowCategory,
  WorkflowNodeType,
} from '../types/workflow';

export const workflowTemplates: WorkflowTemplate[] = [
  // ========================================
  // QUOTE REQUEST WORKFLOW
  // ========================================
  {
    name: 'Quote Request Handling',
    description: 'Automated workflow for handling freight quote requests with customer follow-up',
    category: WorkflowCategory.QUOTE_REQUEST,
    thumbnail: '/templates/quote-request.png',
    defaultNodes: [
      {
        id: 'start-1',
        type: WorkflowNodeType.START,
        label: 'Quote Request Received',
        position: { x: 100, y: 100 },
        config: {
          type: 'START',
          trigger: 'MESSAGE_RECEIVED' as any,
        },
      },
      {
        id: 'extract-1',
        type: WorkflowNodeType.EXTRACT_DATA,
        label: 'Extract Quote Details',
        position: { x: 100, y: 200 },
        config: {
          type: 'EXTRACT_DATA',
        },
      },
      {
        id: 'task-1',
        type: WorkflowNodeType.CREATE_TASK,
        label: 'Assign to Sales Team',
        position: { x: 100, y: 300 },
        config: {
          type: 'CREATE_TASK',
          title: 'Prepare Quote',
          description: 'Review and prepare freight quote',
          priority: 'HIGH',
          taskType: 'PREPARE_QUOTE',
          dueInMinutes: 240, // 4 hours
        },
      },
      {
        id: 'delay-1',
        type: WorkflowNodeType.DELAY,
        label: 'Wait 24 Hours',
        position: { x: 100, y: 400 },
        config: {
          type: 'DELAY',
          delayType: 'FIXED',
          delayMinutes: 1440, // 24 hours
        },
      },
      {
        id: 'condition-1',
        type: WorkflowNodeType.CONDITION,
        label: 'Quote Sent?',
        position: { x: 100, y: 500 },
        config: {
          type: 'CONDITION',
          conditions: [
            {
              field: 'quoteSent',
              operator: 'equals',
              value: true,
            },
          ],
          branches: {
            true: 'end-1',
            false: 'escalate-1',
          },
        },
      },
      {
        id: 'escalate-1',
        type: WorkflowNodeType.ESCALATE,
        label: 'Escalate to Manager',
        position: { x: 300, y: 500 },
        config: {
          type: 'ESCALATE',
          escalateTo: ['sales_manager'],
          reason: 'Quote not sent within 24 hours',
          priority: 'HIGH',
          notifyVia: ['EMAIL', 'WHATSAPP'],
        },
      },
      {
        id: 'end-1',
        type: WorkflowNodeType.END,
        label: 'Quote Process Complete',
        position: { x: 100, y: 600 },
        config: {
          type: 'END',
          outcome: 'SUCCESS',
        },
      },
    ],
    defaultEdges: [
      { id: 'e1', source: 'start-1', target: 'extract-1' },
      { id: 'e2', source: 'extract-1', target: 'task-1' },
      { id: 'e3', source: 'task-1', target: 'delay-1' },
      { id: 'e4', source: 'delay-1', target: 'condition-1' },
      { id: 'e5', source: 'condition-1', target: 'end-1', label: 'Yes' },
      { id: 'e6', source: 'condition-1', target: 'escalate-1', label: 'No' },
      { id: 'e7', source: 'escalate-1', target: 'end-1' },
    ],
    configurableFields: [
      {
        field: 'task-1.assignTo',
        label: 'Assign To',
        type: 'select',
        required: true,
      },
      {
        field: 'task-1.dueInMinutes',
        label: 'Response Time (hours)',
        type: 'number',
        required: true,
      },
    ],
  },

  // ========================================
  // BOOKING CONFIRMATION WORKFLOW
  // ========================================
  {
    name: 'Booking Confirmation & Documentation',
    description: 'Automated workflow for booking confirmation with document collection',
    category: WorkflowCategory.BOOKING,
    defaultNodes: [
      {
        id: 'start-1',
        type: WorkflowNodeType.START,
        label: 'Booking Confirmed',
        position: { x: 100, y: 100 },
        config: {
          type: 'START',
          trigger: 'SHIPMENT_CREATED' as any,
        },
      },
      {
        id: 'whatsapp-1',
        type: WorkflowNodeType.SEND_WHATSAPP,
        label: 'Send Booking Confirmation',
        position: { x: 100, y: 200 },
        config: {
          type: 'SEND_WHATSAPP',
          from: '{{whatsappNumber}}',
          to: '{{customer.phone}}',
          messageType: 'text',
          content: {
            text: 'Dear {{customer.name}}, your booking {{shipment.reference}} has been confirmed. We will collect required documents shortly.',
          },
        },
      },
      {
        id: 'email-1',
        type: WorkflowNodeType.SEND_EMAIL,
        label: 'Send Document List',
        position: { x: 100, y: 300 },
        config: {
          type: 'SEND_EMAIL',
          to: '{{customer.email}}',
          subject: 'Required Documents - {{shipment.reference}}',
          body: 'Please provide the following documents for shipment {{shipment.reference}}...',
          template: 'document_request',
        },
      },
      {
        id: 'task-1',
        type: WorkflowNodeType.CREATE_TASK,
        label: 'Follow Up on Documents',
        position: { x: 100, y: 400 },
        config: {
          type: 'CREATE_TASK',
          title: 'Follow up on document collection',
          description: 'Ensure all documents are received',
          priority: 'MEDIUM',
          taskType: 'DOCUMENT_COLLECTION',
          dueInMinutes: 2880, // 48 hours
        },
      },
      {
        id: 'end-1',
        type: WorkflowNodeType.END,
        label: 'Workflow Complete',
        position: { x: 100, y: 500 },
        config: {
          type: 'END',
          outcome: 'SUCCESS',
        },
      },
    ],
    defaultEdges: [
      { id: 'e1', source: 'start-1', target: 'whatsapp-1' },
      { id: 'e2', source: 'whatsapp-1', target: 'email-1' },
      { id: 'e3', source: 'email-1', target: 'task-1' },
      { id: 'e4', source: 'task-1', target: 'end-1' },
    ],
    configurableFields: [
      {
        field: 'whatsapp-1.from',
        label: 'WhatsApp Business Number',
        type: 'text',
        required: true,
      },
      {
        field: 'email-1.template',
        label: 'Email Template',
        type: 'select',
        required: true,
      },
    ],
  },

  // ========================================
  // SHIPMENT TRACKING UPDATE WORKFLOW
  // ========================================
  {
    name: 'Shipment Tracking Updates',
    description: 'Automated customer notifications for shipment milestone updates',
    category: WorkflowCategory.SHIPMENT_TRACKING,
    defaultNodes: [
      {
        id: 'start-1',
        type: WorkflowNodeType.START,
        label: 'Shipment Status Changed',
        position: { x: 100, y: 100 },
        config: {
          type: 'START',
          trigger: 'SHIPMENT_STATUS_CHANGE' as any,
        },
      },
      {
        id: 'condition-1',
        type: WorkflowNodeType.CONDITION,
        label: 'Customer Tier?',
        position: { x: 100, y: 200 },
        config: {
          type: 'CONDITION',
          conditions: [
            {
              field: 'customer.tier',
              operator: 'in',
              value: ['PREMIUM', 'STANDARD'],
            },
          ],
          branches: {
            true: 'whatsapp-1',
            false: 'email-1',
          },
        },
      },
      {
        id: 'whatsapp-1',
        type: WorkflowNodeType.SEND_WHATSAPP,
        label: 'WhatsApp Notification',
        position: { x: 50, y: 300 },
        config: {
          type: 'SEND_WHATSAPP',
          from: '{{whatsappNumber}}',
          to: '{{customer.phone}}',
          messageType: 'text',
          content: {
            text: 'Shipment {{shipment.reference}} update: {{shipment.status}}. Current location: {{shipment.currentLocation}}',
          },
        },
      },
      {
        id: 'email-1',
        type: WorkflowNodeType.SEND_EMAIL,
        label: 'Email Notification',
        position: { x: 200, y: 300 },
        config: {
          type: 'SEND_EMAIL',
          to: '{{customer.email}}',
          subject: 'Shipment Update - {{shipment.reference}}',
          body: 'Your shipment has been updated...',
          template: 'shipment_update',
        },
      },
      {
        id: 'end-1',
        type: WorkflowNodeType.END,
        label: 'Notification Sent',
        position: { x: 100, y: 400 },
        config: {
          type: 'END',
          outcome: 'SUCCESS',
        },
      },
    ],
    defaultEdges: [
      { id: 'e1', source: 'start-1', target: 'condition-1' },
      { id: 'e2', source: 'condition-1', target: 'whatsapp-1', label: 'Premium/Standard' },
      { id: 'e3', source: 'condition-1', target: 'email-1', label: 'Basic' },
      { id: 'e4', source: 'whatsapp-1', target: 'end-1' },
      { id: 'e5', source: 'email-1', target: 'end-1' },
    ],
    configurableFields: [],
  },

  // ========================================
  // EXCEPTION HANDLING WORKFLOW
  // ========================================
  {
    name: 'Shipment Exception Handling',
    description: 'Handle shipment exceptions with multi-level escalation and customer communication',
    category: WorkflowCategory.EXCEPTION_HANDLING,
    defaultNodes: [
      {
        id: 'start-1',
        type: WorkflowNodeType.START,
        label: 'Exception Detected',
        position: { x: 100, y: 100 },
        config: {
          type: 'START',
          trigger: 'MANUAL' as any,
        },
      },
      {
        id: 'task-1',
        type: WorkflowNodeType.CREATE_TASK,
        label: 'Assign to Operations',
        position: { x: 100, y: 200 },
        config: {
          type: 'CREATE_TASK',
          title: 'Resolve Shipment Exception',
          description: 'Investigate and resolve exception',
          priority: 'URGENT',
          taskType: 'EXCEPTION_HANDLING',
          dueInMinutes: 120, // 2 hours
        },
      },
      {
        id: 'call-1',
        type: WorkflowNodeType.MAKE_CALL,
        label: 'Call Premium Customers',
        position: { x: 100, y: 300 },
        config: {
          type: 'MAKE_CALL',
          from: '{{virtualNumber}}',
          to: '{{customer.phone}}',
          callType: 'C2C',
          recording: true,
        },
      },
      {
        id: 'whatsapp-1',
        type: WorkflowNodeType.SEND_WHATSAPP,
        label: 'WhatsApp Update',
        position: { x: 100, y: 400 },
        config: {
          type: 'SEND_WHATSAPP',
          from: '{{whatsappNumber}}',
          to: '{{customer.phone}}',
          messageType: 'text',
          content: {
            text: 'Important update regarding {{shipment.reference}}. Our team is working on resolving the issue. You will be contacted shortly.',
          },
        },
      },
      {
        id: 'escalate-1',
        type: WorkflowNodeType.ESCALATE,
        label: 'Escalate to Manager',
        position: { x: 100, y: 500 },
        config: {
          type: 'ESCALATE',
          escalateTo: ['operations_manager'],
          reason: 'Critical shipment exception',
          priority: 'CRITICAL',
          notifyVia: ['EMAIL', 'WHATSAPP', 'CALL'],
        },
      },
      {
        id: 'end-1',
        type: WorkflowNodeType.END,
        label: 'Exception Process Initiated',
        position: { x: 100, y: 600 },
        config: {
          type: 'END',
          outcome: 'SUCCESS',
        },
      },
    ],
    defaultEdges: [
      { id: 'e1', source: 'start-1', target: 'task-1' },
      { id: 'e2', source: 'task-1', target: 'call-1' },
      { id: 'e3', source: 'call-1', target: 'whatsapp-1' },
      { id: 'e4', source: 'whatsapp-1', target: 'escalate-1' },
      { id: 'e5', source: 'escalate-1', target: 'end-1' },
    ],
    configurableFields: [
      {
        field: 'task-1.assignTo',
        label: 'Operations Team',
        type: 'select',
        required: true,
      },
      {
        field: 'escalate-1.escalateTo',
        label: 'Escalation Contact',
        type: 'select',
        required: true,
      },
    ],
  },

  // ========================================
  // CUSTOMS CLEARANCE WORKFLOW
  // ========================================
  {
    name: 'Customs Clearance Process',
    description: 'Automated workflow for customs clearance with document verification and follow-ups',
    category: WorkflowCategory.CUSTOMS_CLEARANCE,
    defaultNodes: [
      {
        id: 'start-1',
        type: WorkflowNodeType.START,
        label: 'Shipment Arrived',
        position: { x: 100, y: 100 },
        config: {
          type: 'START',
          trigger: 'SHIPMENT_STATUS_CHANGE' as any,
        },
      },
      {
        id: 'validate-1',
        type: WorkflowNodeType.VALIDATE_DATA,
        label: 'Verify Customs Documents',
        position: { x: 100, y: 200 },
        config: {
          type: 'VALIDATE_DATA',
        },
      },
      {
        id: 'condition-1',
        type: WorkflowNodeType.CONDITION,
        label: 'Documents Complete?',
        position: { x: 100, y: 300 },
        config: {
          type: 'CONDITION',
          conditions: [
            {
              field: 'documentsComplete',
              operator: 'equals',
              value: true,
            },
          ],
          branches: {
            true: 'task-2',
            false: 'whatsapp-1',
          },
        },
      },
      {
        id: 'whatsapp-1',
        type: WorkflowNodeType.SEND_WHATSAPP,
        label: 'Request Missing Documents',
        position: { x: 300, y: 400 },
        config: {
          type: 'SEND_WHATSAPP',
          from: '{{whatsappNumber}}',
          to: '{{customer.phone}}',
          messageType: 'text',
          content: {
            text: 'Missing documents for {{shipment.reference}}. Please provide: {{missingDocuments}}',
          },
        },
      },
      {
        id: 'task-2',
        type: WorkflowNodeType.CREATE_TASK,
        label: 'Submit to Customs',
        position: { x: 100, y: 400 },
        config: {
          type: 'CREATE_TASK',
          title: 'Submit customs declaration',
          description: 'Process customs clearance',
          priority: 'HIGH',
          taskType: 'CUSTOMS_SUBMISSION',
          dueInMinutes: 480, // 8 hours
        },
      },
      {
        id: 'end-1',
        type: WorkflowNodeType.END,
        label: 'Customs Process Complete',
        position: { x: 100, y: 500 },
        config: {
          type: 'END',
          outcome: 'SUCCESS',
        },
      },
    ],
    defaultEdges: [
      { id: 'e1', source: 'start-1', target: 'validate-1' },
      { id: 'e2', source: 'validate-1', target: 'condition-1' },
      { id: 'e3', source: 'condition-1', target: 'task-2', label: 'Complete' },
      { id: 'e4', source: 'condition-1', target: 'whatsapp-1', label: 'Incomplete' },
      { id: 'e5', source: 'whatsapp-1', target: 'end-1' },
      { id: 'e6', source: 'task-2', target: 'end-1' },
    ],
    configurableFields: [
      {
        field: 'task-2.assignTo',
        label: 'Customs Team',
        type: 'select',
        required: true,
      },
    ],
  },
];

export default workflowTemplates;
