// Database Types
export interface CommunicationThread {
  id: string;
  reference: string;
  type: ThreadType;
  status: ThreadStatus;
  priority: Priority;
  customer_id: string;
  primary_contact_id?: string;
  primary_channel: Channel;
  channels: Channel[];
  workflow_stage?: string;
  workflow_state?: any;
  current_action_id?: string;
  tat_status?: string;
  sla_status?: string;
  sla_deadline?: Date;
  tat_started_at?: Date;
  tat_paused_at?: Date;
  tat_elapsed_minutes: number;
  tags: string[];
  starred: boolean;
  pinned: boolean;
  archived: boolean;
  assigned_to?: string;
  followers: string[];
  shipment_id?: string;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  last_message_at?: Date;
  resolved_at?: Date;
  closed_at?: Date;
}

export interface CommunicationMessage {
  id: string;
  thread_id: string;
  channel: Channel;
  direction: MessageDirection;
  status: MessageStatus;
  content: string;
  html_content?: string;
  subject?: string;
  from_address?: string;
  from_name?: string;
  to_addresses?: EmailAddress[];
  cc_addresses?: EmailAddress[];
  external_id?: string;
  external_thread_id?: string;
  sentiment?: string;
  intent?: string;
  confidence_score?: number;
  extracted_data?: any;
  ai_summary?: string;
  key_points?: string[];
  attachments: Attachment[];
  sent_at: Date;
  delivered_at?: Date;
  read_at?: Date;
  created_at: Date;
  reply_to_id?: string;
}

export interface CommunicationAction {
  id: string;
  thread_id: string;
  type: string;
  title: string;
  description?: string;
  status: ActionStatus;
  priority: Priority;
  risk_level?: string;
  assigned_to?: string;
  assigned_at?: Date;
  depends_on: string[];
  blocks: string[];
  can_auto_execute: boolean;
  auto_execution_config?: any;
  execution_result?: any;
  ai_generated: boolean;
  confidence_score?: number;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  completed_at?: Date;
  due_at?: Date;
}

export interface Shipment {
  id: string;
  reference: string;
  customer_id: string;
  service_type: ServiceType;
  cargo_type?: string;
  origin_country?: string;
  origin_city?: string;
  origin_port?: string;
  destination_country?: string;
  destination_city?: string;
  destination_port?: string;
  cargo_data?: any;
  status: string;
  current_location?: string;
  cargo_ready_date?: Date;
  estimated_departure?: Date;
  estimated_arrival?: Date;
  actual_departure?: Date;
  actual_arrival?: Date;
  documents: any[];
  created_at: Date;
  updated_at: Date;
}

export interface Customer {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  tier: CustomerTier;
  preferred_channel?: Channel;
  communication_preferences?: any;
  tags: string[];
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Contact {
  id: string;
  customer_id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  is_primary: boolean;
  preferred_channel?: Channel;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  preferences: any;
  is_active: boolean;
  last_seen_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  version: number;
  status: WorkflowStatus;
  nodes: any;
  edges: any;
  triggers?: any;
  usage_count: number;
  avg_completion_time?: number;
  success_rate?: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  published_at?: Date;
  published_by?: string;
}

export interface WorkflowInstance {
  id: string;
  workflow_definition_id: string;
  workflow_version: number;
  shipment_id?: string;
  thread_id?: string;
  entity_type: EntityType;
  status: WorkflowInstanceStatus;
  current_node_id?: string;
  current_step_number: number;
  total_steps: number;
  context: any;
  started_at?: Date;
  completed_at?: Date;
  paused_at?: Date;
  estimated_completion_time?: Date;
  actual_completion_time?: Date;
  exceptions: any[];
  retry_count: number;
  created_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link_type?: string;
  link_id?: string;
  read: boolean;
  read_at?: Date;
  created_at: Date;
}

// Enums
export enum ThreadType {
  QUOTE_REQUEST = 'QUOTE_REQUEST',
  BOOKING = 'BOOKING',
  DOCUMENTATION = 'DOCUMENTATION',
  CUSTOMS = 'CUSTOMS',
  SHIPMENT_UPDATE = 'SHIPMENT_UPDATE',
  EXCEPTION = 'EXCEPTION',
  QUERY = 'QUERY',
  COMPLAINT = 'COMPLAINT',
  GENERAL = 'GENERAL',
}

export enum ThreadStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_CLIENT = 'AWAITING_CLIENT',
  AWAITING_INTERNAL = 'AWAITING_INTERNAL',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
  CRITICAL = 'CRITICAL',
}

export enum Channel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  WECHAT = 'WECHAT',
  SMS = 'SMS',
  VOICE = 'VOICE',
  PORTAL = 'PORTAL',
  SLACK = 'SLACK',
  TEAMS = 'TEAMS',
}

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MessageStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum ActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum ServiceType {
  SEA_FCL = 'SEA_FCL',
  SEA_LCL = 'SEA_LCL',
  AIR = 'AIR',
  ROAD = 'ROAD',
  RAIL = 'RAIL',
  MULTIMODAL = 'MULTIMODAL',
}

export enum CustomerTier {
  PREMIUM = 'PREMIUM',
  STANDARD = 'STANDARD',
  BASIC = 'BASIC',
  NEW = 'NEW',
}

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  VALIDATOR = 'validator',
  SUPPORT = 'support',
  VIEWER = 'viewer',
}

export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum WorkflowInstanceStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum EntityType {
  SHIPMENT = 'SHIPMENT',
  THREAD = 'THREAD',
  STANDALONE = 'STANDALONE',
}

export enum NotificationType {
  NEW_MESSAGE = 'NEW_MESSAGE',
  ACTION_ASSIGNED = 'ACTION_ASSIGNED',
  SLA_WARNING = 'SLA_WARNING',
  WORKFLOW_COMPLETE = 'WORKFLOW_COMPLETE',
  EXCEPTION_RAISED = 'EXCEPTION_RAISED',
}

// API Types
export interface EmailAddress {
  address: string;
  name?: string;
}

export interface Attachment {
  id?: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ThreadFilters {
  status?: ThreadStatus[];
  priority?: Priority[];
  channel?: Channel[];
  assigned_to?: string;
  customer_id?: string;
  shipment_id?: string;
  tags?: string[];
  search?: string;
  starred?: boolean;
  archived?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

// Request/Response Types
export interface CreateThreadRequest {
  type: ThreadType;
  priority?: Priority;
  customer_id: string;
  primary_contact_id?: string;
  primary_channel: Channel;
  shipment_id?: string;
  tags?: string[];
}

export interface UpdateThreadRequest {
  status?: ThreadStatus;
  priority?: Priority;
  assigned_to?: string;
  tags?: string[];
  starred?: boolean;
  pinned?: boolean;
  archived?: boolean;
  followers?: string[];
  shipment_id?: string;
}

export interface SendMessageRequest {
  channel: Channel;
  content: string;
  subject?: string;
  to_addresses?: EmailAddress[];
  cc_addresses?: EmailAddress[];
  attachments?: Attachment[];
  reply_to_id?: string;
}

export interface CreateActionRequest {
  type: string;
  title: string;
  description?: string;
  priority?: Priority;
  assigned_to?: string;
  due_at?: Date;
  depends_on?: string[];
}

// Email Types
export interface ParsedEmail {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  text: string;
  html?: string;
  date: Date;
  headers: Record<string, string>;
  attachments: Attachment[];
  inReplyTo?: string;
  references?: string[];
}

export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  imap: {
    host: string;
    port: number;
    user: string;
    password: string;
    tls: boolean;
  };
}

// WhatsApp/SMS Types
export interface WhatsAppMessage {
  from: string;
  to: string;
  body: string;
  mediaUrl?: string;
  messageSid: string;
}

export interface SMSMessage {
  from: string;
  to: string;
  body: string;
  messageSid: string;
}

// AI Types
export interface ComposeContext {
  thread_id: string;
  customer_name?: string;
  customer_tier?: CustomerTier;
  thread_history: CommunicationMessage[];
  shipment_data?: Shipment;
  recent_actions: CommunicationAction[];
  user_input?: string;
  tone?: 'formal' | 'friendly' | 'professional';
  language?: string;
}

export interface ComposeSuggestion {
  id: string;
  content: string;
  subject?: string;
  reasoning: string;
  confidence: number;
  tone: string;
  estimated_response_time?: string;
}

export interface ExtractedData {
  entities: Record<string, any>;
  intent: string;
  sentiment: string;
  key_points: string[];
  action_items: string[];
  questions: string[];
}

// WebSocket Types
export interface WebSocketEvent {
  type: string;
  payload: any;
}

export interface PresenceStatus {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen?: Date;
}

// Agent Types
export interface AgentTask {
  agentId: string;
  taskType: string;
  input: any;
  context?: any;
}

export interface AgentEvent {
  type: string;
  payload: any;
}

// Error Types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

// Re-export workflow types
export * from './workflow';
