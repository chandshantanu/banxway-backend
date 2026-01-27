// Workflow Builder Types for Logistics Operations

export enum WorkflowNodeType {
  // Core Nodes
  START = 'START',
  END = 'END',

  // Decision Nodes
  CONDITION = 'CONDITION',
  APPROVAL = 'APPROVAL',

  // Action Nodes
  SEND_EMAIL = 'SEND_EMAIL',
  SEND_WHATSAPP = 'SEND_WHATSAPP',
  SEND_SMS = 'SEND_SMS',
  MAKE_CALL = 'MAKE_CALL',
  CREATE_TASK = 'CREATE_TASK',
  UPDATE_SHIPMENT = 'UPDATE_SHIPMENT',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',

  // Data Nodes
  EXTRACT_DATA = 'EXTRACT_DATA',
  VALIDATE_DATA = 'VALIDATE_DATA',
  TRANSFORM_DATA = 'TRANSFORM_DATA',

  // Integration Nodes
  API_CALL = 'API_CALL',
  WEBHOOK = 'WEBHOOK',
  DATABASE_QUERY = 'DATABASE_QUERY',

  // AI Nodes
  AI_CLASSIFICATION = 'AI_CLASSIFICATION',
  AI_EXTRACTION = 'AI_EXTRACTION',
  AI_DECISION = 'AI_DECISION',

  // Time Nodes
  DELAY = 'DELAY',
  SCHEDULE = 'SCHEDULE',
  WAIT_FOR_EVENT = 'WAIT_FOR_EVENT',

  // Escalation Nodes
  ESCALATE = 'ESCALATE',
  ASSIGN = 'ASSIGN',
  REASSIGN = 'REASSIGN',
}

export enum WorkflowTriggerType {
  MANUAL = 'MANUAL',
  SHIPMENT_CREATED = 'SHIPMENT_CREATED',
  SHIPMENT_STATUS_CHANGE = 'SHIPMENT_STATUS_CHANGE',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  SLA_BREACH = 'SLA_BREACH',
  TAT_WARNING = 'TAT_WARNING',
  CUSTOMER_TIER_CHANGE = 'CUSTOMER_TIER_CHANGE',
  SCHEDULED = 'SCHEDULED',
  WEBHOOK = 'WEBHOOK',
}

export enum WorkflowCategory {
  QUOTE_REQUEST = 'QUOTE_REQUEST',
  BOOKING = 'BOOKING',
  DOCUMENTATION = 'DOCUMENTATION',
  CUSTOMS_CLEARANCE = 'CUSTOMS_CLEARANCE',
  SHIPMENT_TRACKING = 'SHIPMENT_TRACKING',
  EXCEPTION_HANDLING = 'EXCEPTION_HANDLING',
  CUSTOMER_ONBOARDING = 'CUSTOMER_ONBOARDING',
  PAYMENT_FOLLOW_UP = 'PAYMENT_FOLLOW_UP',
  DELIVERY_CONFIRMATION = 'DELIVERY_CONFIRMATION',
  GENERAL = 'GENERAL',
}

// Node Configuration Types

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  description?: string;
  position: { x: number; y: number };
  config: NodeConfig;
  metadata?: Record<string, any>;
}

export type NodeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | ConditionNodeConfig
  | ApprovalNodeConfig
  | EmailNodeConfig
  | WhatsAppNodeConfig
  | SMSNodeConfig
  | CallNodeConfig
  | TaskNodeConfig
  | EscalateNodeConfig
  | DelayNodeConfig
  | AINodeConfig
  | APICallNodeConfig
  | GenericNodeConfig;

export interface StartNodeConfig {
  type: 'START';
  trigger: WorkflowTriggerType;
  triggerConfig?: {
    scheduleExpression?: string; // Cron expression
    webhookUrl?: string;
    filters?: Record<string, any>;
  };
}

export interface EndNodeConfig {
  type: 'END';
  outcome: 'SUCCESS' | 'FAILURE' | 'CANCELLED';
  finalActions?: {
    sendNotification?: boolean;
    updateStatus?: string;
    webhookUrl?: string;
  };
}

export interface ConditionNodeConfig {
  type: 'CONDITION';
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
    value: any;
    logic?: 'AND' | 'OR';
  }>;
  branches: {
    true: string; // Next node ID
    false: string; // Next node ID
  };
}

export interface ApprovalNodeConfig {
  type: 'APPROVAL';
  approvers: string[]; // User IDs or roles
  approvalType: 'ANY' | 'ALL' | 'MAJORITY';
  timeoutMinutes?: number;
  escalationPolicy?: {
    escalateAfterMinutes: number;
    escalateTo: string[];
  };
  branches: {
    approved: string;
    rejected: string;
    timeout: string;
  };
}

export interface EmailNodeConfig {
  type: 'SEND_EMAIL';
  from?: string;
  to: string | string[]; // Can use template variables like {{customer.email}}
  cc?: string | string[];
  subject: string;
  body: string;
  template?: string;
  attachments?: string[];
  variables?: Record<string, string>;
}

export interface WhatsAppNodeConfig {
  type: 'SEND_WHATSAPP';
  from: string; // WhatsApp business number
  to: string | string[];
  messageType: 'text' | 'image' | 'document' | 'video' | 'location' | 'template';
  content: {
    text?: string;
    imageUrl?: string;
    documentUrl?: string;
    videoUrl?: string;
    location?: {
      latitude: string;
      longitude: string;
      name?: string;
      address?: string;
    };
    templateName?: string;
    templateParams?: Record<string, string>;
  };
  variables?: Record<string, string>;
}

export interface SMSNodeConfig {
  type: 'SEND_SMS';
  from: string;
  to: string | string[];
  message: string;
  template?: string;
  variables?: Record<string, string>;
}

export interface CallNodeConfig {
  type: 'MAKE_CALL';
  from: string; // Virtual number
  to: string;
  callType: 'C2C' | 'OUTBOUND';
  recording?: boolean;
  maxDuration?: number; // seconds
  statusCallback?: string;
  metadata?: Record<string, any>;
}

export interface TaskNodeConfig {
  type: 'CREATE_TASK';
  title: string;
  description: string;
  assignTo?: string | string[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueInMinutes?: number;
  taskType: string;
  metadata?: Record<string, any>;
}

export interface EscalateNodeConfig {
  type: 'ESCALATE';
  escalateTo: string | string[]; // User IDs or roles
  reason: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  notifyVia: ('EMAIL' | 'WHATSAPP' | 'SMS' | 'CALL')[];
  metadata?: Record<string, any>;
}

export interface DelayNodeConfig {
  type: 'DELAY';
  delayType: 'FIXED' | 'UNTIL' | 'BUSINESS_HOURS';
  delayMinutes?: number;
  delayUntil?: string; // ISO timestamp
  businessHoursConfig?: {
    startHour: number;
    endHour: number;
    timezone: string;
  };
}

export interface AINodeConfig {
  type: 'AI_CLASSIFICATION' | 'AI_EXTRACTION' | 'AI_DECISION';
  model: 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-sonnet';
  prompt: string;
  inputFields: string[];
  outputMapping: Record<string, string>;
  temperature?: number;
  maxTokens?: number;
}

export interface APICallNodeConfig {
  type: 'API_CALL';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  authentication?: {
    type: 'none' | 'basic' | 'bearer' | 'api_key';
    credentials?: Record<string, string>;
  };
  responseMapping?: Record<string, string>;
  errorHandling?: {
    retries: number;
    retryDelay: number;
    fallbackValue?: any;
  };
}

export interface GenericNodeConfig {
  [key: string]: any;
}

// Workflow Edge

export interface WorkflowEdge {
  id: string;
  source: string; // Source node ID
  target: string; // Target node ID
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: string;
  metadata?: Record<string, any>;
}

// Complete Workflow Definition

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  category: WorkflowCategory;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

  // Visual structure
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];

  // Triggers
  triggers: {
    type: WorkflowTriggerType;
    config?: any;
  }[];

  // Metadata
  tags?: string[];
  serviceTypes?: string[]; // SEA_FCL, AIR, etc.
  customerTiers?: string[]; // PREMIUM, STANDARD, etc.

  // SLA & TAT configuration
  slaConfig?: {
    responseTimeMinutes: number;
    resolutionTimeMinutes: number;
    escalationRules: Array<{
      afterMinutes: number;
      escalateTo: string[];
      notifyVia: string[];
    }>;
  };

  // Statistics
  usageCount: number;
  avgCompletionTimeMinutes?: number;
  successRate?: number;

  // Audit
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  publishedBy?: string;
}

// Workflow Instance (Execution)

export interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  workflowVersion: number;

  // Entity linkage
  entityType: 'SHIPMENT' | 'THREAD' | 'CUSTOMER' | 'STANDALONE';
  entityId?: string;
  shipmentId?: string;
  threadId?: string;
  customerId?: string;

  // Execution state
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentNodeId?: string;
  currentStepNumber: number;
  totalSteps: number;

  // Runtime context
  context: Record<string, any>;
  variables: Record<string, any>;

  // Timing
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  estimatedCompletionTime?: Date;

  // Error handling
  errors: Array<{
    nodeId: string;
    error: string;
    timestamp: Date;
    retryCount: number;
  }>;

  // Audit trail
  executionLog: Array<{
    nodeId: string;
    nodeName: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
    startedAt: Date;
    completedAt?: Date;
    input?: any;
    output?: any;
    error?: string;
    executedBy?: string;
    metadata?: Record<string, any>;
  }>;

  createdAt: Date;
}

// Workflow Matching (LLM-based)

export interface WorkflowMatchRequest {
  shipment?: {
    serviceType: string;
    originCountry: string;
    destinationCountry: string;
    cargoType?: string;
    value?: number;
  };
  customer?: {
    tier: string;
    industry?: string;
    preferences?: Record<string, any>;
  };
  thread?: {
    type: string;
    priority: string;
    channel: string;
  };
  context?: string; // Free-text description
}

export interface WorkflowMatchResult {
  workflowId: string;
  workflowName: string;
  matchScore: number; // 0-100
  matchReason: string;
  suggestedVariables?: Record<string, any>;
  confidence: number;
}

// TAT (Turn Around Time) Configuration

export interface TATConfig {
  taskType: string;
  standardTATMinutes: number;
  urgentTATMinutes: number;
  warningThresholdPercent: number; // e.g., 80% of TAT
  escalationRules: Array<{
    afterMinutes: number;
    escalateTo: string[];
    actions: ('EMAIL' | 'WHATSAPP' | 'SMS' | 'CALL' | 'NOTIFICATION')[];
  }>;
}

// Exotel Integration Types

export interface ExotelCallRequest {
  from: {
    contact_uri: string;
    state_management?: boolean;
  };
  to: {
    contact_uri: string;
  };
  virtual_number: string;
  recording?: {
    record: boolean;
    channels?: 'single' | 'dual';
  };
  max_time_limit?: number;
  attempt_time_out?: number;
  custom_field?: string;
  status_callback?: Array<{
    event: 'terminal' | 'answered' | 'completed';
    url: string;
  }>;
}

export interface ExotelCallResponse {
  call_sid: string;
  status: string;
  direction: string;
  from: string;
  to: string;
  date_created: string;
  date_updated: string;
}

export interface ExotelWhatsAppMessage {
  from: string;
  to: string;
  content: {
    type: 'text' | 'image' | 'document' | 'video' | 'audio' | 'location' | 'template';
    text?: {
      body: string;
    };
    image?: {
      link: string;
      caption?: string;
    };
    document?: {
      link: string;
      caption?: string;
      filename?: string;
    };
    video?: {
      link: string;
      caption?: string;
    };
    audio?: {
      link: string;
    };
    location?: {
      latitude: string;
      longitude: string;
      name?: string;
      address?: string;
    };
    template?: {
      name: string;
      language: string;
      components?: any[];
    };
  };
}

export interface ExotelWebhookPayload {
  // Call webhooks
  CallSid?: string;
  CallStatus?: string;
  Direction?: string;
  From?: string;
  To?: string;
  CallDuration?: string;
  RecordingUrl?: string;

  // WhatsApp webhooks
  MessageSid?: string;
  MessageStatus?: string;
  Body?: string;
  MediaUrl?: string;
  ErrorMessage?: string;

  // SMS webhooks
  SmsSid?: string;
  SmsStatus?: string;
  Status?: string;

  // Common
  EventType?: string;
  DateCreated?: string;
  DateUpdated?: string;
  CustomField?: string;
}

// Workflow Templates

export interface WorkflowTemplate {
  name: string;
  description: string;
  category: WorkflowCategory;
  thumbnail?: string;
  defaultNodes: WorkflowNode[];
  defaultEdges: WorkflowEdge[];
  configurableFields: Array<{
    field: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'multiselect';
    required: boolean;
    options?: any[];
  }>;
}
