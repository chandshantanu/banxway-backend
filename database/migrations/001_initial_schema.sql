-- Banxway Platform - Initial Database Schema
-- This migration creates all core tables for the communication hub

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types/enums
CREATE TYPE thread_status AS ENUM ('NEW', 'IN_PROGRESS', 'AWAITING_CLIENT', 'AWAITING_INTERNAL', 'RESOLVED', 'CLOSED', 'CANCELLED');
CREATE TYPE priority_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL');
CREATE TYPE channel_type AS ENUM ('EMAIL', 'WHATSAPP', 'WECHAT', 'SMS', 'VOICE', 'PORTAL', 'SLACK', 'TEAMS');
CREATE TYPE message_direction AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE message_status AS ENUM ('DRAFT', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
CREATE TYPE action_status AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE service_type AS ENUM ('SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD', 'RAIL', 'MULTIMODAL');
CREATE TYPE customer_tier AS ENUM ('PREMIUM', 'STANDARD', 'BASIC', 'NEW');
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'validator', 'support', 'viewer');
CREATE TYPE workflow_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE workflow_instance_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE entity_type AS ENUM ('SHIPMENT', 'THREAD', 'STANDALONE');
CREATE TYPE notification_type AS ENUM ('NEW_MESSAGE', 'ACTION_ASSIGNED', 'SLA_WARNING', 'WORKFLOW_COMPLETE', 'EXCEPTION_RAISED');

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role user_role NOT NULL DEFAULT 'viewer',
  preferences JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- =====================================================
-- CUSTOMERS TABLE
-- =====================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  tier customer_tier DEFAULT 'STANDARD',
  preferred_channel channel_type,
  communication_preferences JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_tier ON customers(tier);
CREATE INDEX idx_customers_tags ON customers USING GIN(tags);

-- =====================================================
-- CONTACTS TABLE
-- =====================================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(100),
  is_primary BOOLEAN DEFAULT FALSE,
  preferred_channel channel_type,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_customer ON contacts(customer_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_primary ON contacts(is_primary) WHERE is_primary = TRUE;

-- =====================================================
-- SHIPMENTS TABLE
-- =====================================================
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  service_type service_type NOT NULL,
  cargo_type VARCHAR(20),
  origin_country VARCHAR(100),
  origin_city VARCHAR(100),
  origin_port VARCHAR(100),
  destination_country VARCHAR(100),
  destination_city VARCHAR(100),
  destination_port VARCHAR(100),
  cargo_data JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  current_location VARCHAR(255),
  cargo_ready_date DATE,
  estimated_departure TIMESTAMPTZ,
  estimated_arrival TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  documents JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipments_customer ON shipments(customer_id);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_reference ON shipments(reference);

-- =====================================================
-- COMMUNICATION THREADS TABLE
-- =====================================================
CREATE TABLE communication_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  status thread_status NOT NULL DEFAULT 'NEW',
  priority priority_level NOT NULL DEFAULT 'MEDIUM',

  customer_id UUID REFERENCES customers(id),
  primary_contact_id UUID REFERENCES contacts(id),

  primary_channel channel_type NOT NULL,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,

  workflow_stage VARCHAR(100),
  workflow_state JSONB DEFAULT '{}'::jsonb,
  current_action_id UUID,

  tat_status VARCHAR(20),
  sla_status VARCHAR(20),
  sla_deadline TIMESTAMPTZ,
  tat_started_at TIMESTAMPTZ,
  tat_paused_at TIMESTAMPTZ,
  tat_elapsed_minutes INTEGER DEFAULT 0,

  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  starred BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,

  assigned_to UUID REFERENCES users(id),
  followers UUID[] DEFAULT ARRAY[]::UUID[],

  shipment_id UUID REFERENCES shipments(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX idx_threads_customer ON communication_threads(customer_id);
CREATE INDEX idx_threads_assigned ON communication_threads(assigned_to);
CREATE INDEX idx_threads_status ON communication_threads(status);
CREATE INDEX idx_threads_shipment ON communication_threads(shipment_id);
CREATE INDEX idx_threads_created ON communication_threads(created_at DESC);
CREATE INDEX idx_threads_sla ON communication_threads(sla_deadline) WHERE sla_deadline IS NOT NULL;
CREATE INDEX idx_threads_tags ON communication_threads USING GIN(tags);
CREATE INDEX idx_threads_archived ON communication_threads(archived);

-- =====================================================
-- COMMUNICATION MESSAGES TABLE
-- =====================================================
CREATE TABLE communication_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,

  channel channel_type NOT NULL,
  direction message_direction NOT NULL,
  status message_status DEFAULT 'SENT',

  content TEXT NOT NULL,
  html_content TEXT,
  subject VARCHAR(500),

  from_address VARCHAR(255),
  from_name VARCHAR(255),
  to_addresses JSONB DEFAULT '[]'::jsonb,
  cc_addresses JSONB DEFAULT '[]'::jsonb,

  external_id VARCHAR(255),
  external_thread_id VARCHAR(255),

  sentiment VARCHAR(20),
  intent VARCHAR(50),
  confidence_score NUMERIC(3,2),
  extracted_data JSONB DEFAULT '{}'::jsonb,
  ai_summary TEXT,
  key_points TEXT[] DEFAULT ARRAY[]::TEXT[],

  attachments JSONB DEFAULT '[]'::jsonb,

  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  reply_to_id UUID REFERENCES communication_messages(id)
);

CREATE INDEX idx_messages_thread ON communication_messages(thread_id, created_at DESC);
CREATE INDEX idx_messages_external ON communication_messages(external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX idx_messages_external_unique ON communication_messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_messages_channel ON communication_messages(channel);
CREATE INDEX idx_messages_direction ON communication_messages(direction);

-- =====================================================
-- COMMUNICATION ACTIONS TABLE
-- =====================================================
CREATE TABLE communication_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status action_status NOT NULL DEFAULT 'PENDING',
  priority priority_level NOT NULL DEFAULT 'MEDIUM',
  risk_level VARCHAR(20),

  assigned_to UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ,

  depends_on UUID[] DEFAULT ARRAY[]::UUID[],
  blocks UUID[] DEFAULT ARRAY[]::UUID[],

  can_auto_execute BOOLEAN DEFAULT FALSE,
  auto_execution_config JSONB DEFAULT '{}'::jsonb,
  execution_result JSONB DEFAULT '{}'::jsonb,

  ai_generated BOOLEAN DEFAULT FALSE,
  confidence_score NUMERIC(3,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ
);

CREATE INDEX idx_actions_thread ON communication_actions(thread_id);
CREATE INDEX idx_actions_assigned ON communication_actions(assigned_to);
CREATE INDEX idx_actions_status ON communication_actions(status);
CREATE INDEX idx_actions_due ON communication_actions(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX idx_actions_type ON communication_actions(type);

-- =====================================================
-- WORKFLOW DEFINITIONS TABLE
-- =====================================================
CREATE TABLE workflow_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status workflow_status NOT NULL DEFAULT 'DRAFT',

  nodes JSONB NOT NULL DEFAULT '{}'::jsonb,
  edges JSONB NOT NULL DEFAULT '{}'::jsonb,

  triggers JSONB DEFAULT '{}'::jsonb,

  usage_count INTEGER DEFAULT 0,
  avg_completion_time INTEGER,
  success_rate NUMERIC(3,2),

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id)
);

CREATE INDEX idx_workflow_defs_status ON workflow_definitions(status);
CREATE INDEX idx_workflow_defs_category ON workflow_definitions(category);

-- =====================================================
-- WORKFLOW INSTANCES TABLE
-- =====================================================
CREATE TABLE workflow_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id),
  workflow_version INTEGER NOT NULL,

  shipment_id UUID REFERENCES shipments(id),
  thread_id UUID REFERENCES communication_threads(id),
  entity_type entity_type NOT NULL,

  status workflow_instance_status NOT NULL DEFAULT 'NOT_STARTED',
  current_node_id VARCHAR(100),
  current_step_number INTEGER DEFAULT 0,
  total_steps INTEGER NOT NULL,

  context JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,

  estimated_completion_time TIMESTAMPTZ,
  actual_completion_time TIMESTAMPTZ,

  exceptions JSONB DEFAULT '[]'::jsonb,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_instances_definition ON workflow_instances(workflow_definition_id);
CREATE INDEX idx_workflow_instances_shipment ON workflow_instances(shipment_id);
CREATE INDEX idx_workflow_instances_thread ON workflow_instances(thread_id);
CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);

-- =====================================================
-- WORKFLOW STEP EXECUTIONS TABLE
-- =====================================================
CREATE TABLE workflow_step_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(20) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration INTEGER,

  executed_by UUID REFERENCES users(id),
  executed_by_role VARCHAR(50),
  result VARCHAR(20),
  output_data JSONB DEFAULT '{}'::jsonb,
  notes TEXT,

  branch_taken VARCHAR(100),
  condition_evaluated BOOLEAN
);

CREATE INDEX idx_step_executions_instance ON workflow_step_executions(workflow_instance_id);
CREATE INDEX idx_step_executions_status ON workflow_step_executions(status);

-- =====================================================
-- EMAIL DRAFTS TABLE
-- =====================================================
CREATE TABLE email_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES communication_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  subject VARCHAR(500),
  body TEXT NOT NULL,
  html_body TEXT,

  to_addresses JSONB DEFAULT '[]'::jsonb,
  cc_addresses JSONB DEFAULT '[]'::jsonb,

  attachments JSONB DEFAULT '[]'::jsonb,

  is_template BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drafts_thread ON email_drafts(thread_id);
CREATE INDEX idx_drafts_user ON email_drafts(user_id);

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  link_type VARCHAR(50),
  link_id UUID,

  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(read);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_threads_updated_at
  BEFORE UPDATE ON communication_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_workflow_defs_updated_at
  BEFORE UPDATE ON workflow_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update thread last_activity_at when message is created
CREATE OR REPLACE FUNCTION update_thread_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE communication_threads
  SET
    last_activity_at = NOW(),
    last_message_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_thread_last_activity
  AFTER INSERT ON communication_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_last_activity();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Users can read all customers (if authenticated)
CREATE POLICY customers_select_authenticated ON customers
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Similar policies for other tables...
-- (Note: In production, you'd want more granular RLS policies based on roles)

-- =====================================================
-- SEED DATA (Optional for development)
-- =====================================================

-- Insert a default admin user (update with real auth.users id after user signs up)
-- INSERT INTO users (id, email, full_name, role, is_active)
-- VALUES ('00000000-0000-0000-0000-000000000000', 'admin@banxway.com', 'Admin User', 'admin', TRUE);
