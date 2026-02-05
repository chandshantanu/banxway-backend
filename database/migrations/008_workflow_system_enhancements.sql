-- Migration: 008_workflow_system_enhancements.sql
-- Purpose: Enhanced workflow system with templates, loops, events, and admin controls
-- Created: 2026-02-04
-- Author: Claude Sonnet 4.5
-- Dependencies: 007_freight_workflows.sql

-- ============================================================================
-- Workflow System Enhancements for Freight Operations
-- ============================================================================

-- Workflow status enum
CREATE TYPE workflow_status AS ENUM (
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
  'DEPRECATED'
);

-- Workflow instance status (enhanced)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_instance_status') THEN
    CREATE TYPE workflow_instance_status AS ENUM (
      'NOT_STARTED',
      'IN_PROGRESS',
      'WAITING',      -- Waiting for external event
      'PAUSED',
      'RETRY',        -- Retrying failed step
      'COMPLETED',
      'FAILED',
      'CANCELLED'
    );
  ELSE
    -- Add new values if type exists
    ALTER TYPE workflow_instance_status ADD VALUE IF NOT EXISTS 'WAITING';
    ALTER TYPE workflow_instance_status ADD VALUE IF NOT EXISTS 'RETRY';
  END IF;
END $$;

-- Workflow category enum (enhanced)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_category') THEN
    CREATE TYPE workflow_category AS ENUM (
      'QUOTE_REQUEST',
      'BOOKING',
      'DOCUMENTATION',
      'CUSTOMS_CLEARANCE',
      'SHIPMENT_TRACKING',
      'EXCEPTION_HANDLING',
      'CUSTOMER_ONBOARDING',
      'PAYMENT_FOLLOW_UP',
      'DELIVERY_CONFIRMATION',
      'GENERAL'
    );
  END IF;
END $$;

-- Event trigger types
CREATE TYPE workflow_event_type AS ENUM (
  'DOCUMENT_UPLOADED',
  'STATUS_CHANGED',
  'QUOTATION_ACCEPTED',
  'QUOTATION_REJECTED',
  'TAT_WARNING',
  'TAT_BREACH',
  'KYC_PENDING',
  'PAYMENT_RECEIVED',
  'MISSED_CALL',           -- Exotel missed call
  'WHATSAPP_RECEIVED',
  'EMAIL_RECEIVED',
  'TASK_COMPLETED',
  'APPROVAL_GRANTED',
  'APPROVAL_REJECTED',
  'CUSTOM'
);

COMMENT ON TYPE workflow_status IS 'Workflow definition lifecycle status';
COMMENT ON TYPE workflow_instance_status IS 'Workflow execution instance status';
COMMENT ON TYPE workflow_event_type IS 'Types of events that can trigger workflows';

-- ============================================================================
-- WORKFLOW DEFINITIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category workflow_category NOT NULL,
  
  -- Workflow type metadata
  shipment_types shipment_type[],      -- Which shipment types this applies to
  service_requirements JSONB,          -- {customs: true/false, door_delivery: true/false}
  customer_tiers TEXT[],                -- ['PREMIUM', 'STANDARD', 'BASIC']
  
  -- Visual structure (React Flow format)
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,    -- Array of WorkflowNode
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,    -- Array of WorkflowEdge
  
  -- Triggers
  triggers JSONB DEFAULT '[]'::jsonb,   -- Array of trigger configurations
  
  -- Versioning
  version INTEGER DEFAULT 1,
  status workflow_status DEFAULT 'DRAFT',
  is_template BOOLEAN DEFAULT false,    -- Is this a reusable template?
  parent_workflow_id UUID REFERENCES workflow_definitions(id),
  
  -- SLA/TAT configuration
  sla_config JSONB,                     -- {responseTimeMinutes, resolutionTimeMinutes, escalationRules}
  
  -- Statistics
  usage_count INTEGER DEFAULT 0,
  avg_completion_time_minutes INTEGER,
  success_rate NUMERIC(5,2),
  
  -- Access control
  created_by UUID REFERENCES users(id),
  published_by UUID REFERENCES users(id),
  
  -- Metadata
  tags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(name, version)
);

CREATE INDEX idx_workflow_defs_shipment_type ON workflow_definitions USING GIN (shipment_types);
CREATE INDEX idx_workflow_defs_category ON workflow_definitions (category);
CREATE INDEX idx_workflow_defs_status ON workflow_definitions (status) WHERE status = 'ACTIVE';
CREATE INDEX idx_workflow_defs_template ON workflow_definitions (is_template) WHERE is_template = true;
CREATE INDEX idx_workflow_defs_customer_tiers ON workflow_definitions USING GIN (customer_tiers);

COMMENT ON TABLE workflow_definitions IS 'Workflow definitions with visual structure and versioning';
COMMENT ON COLUMN workflow_definitions.nodes IS 'React Flow nodes array with node type, position, and configuration';
COMMENT ON COLUMN workflow_definitions.edges IS 'React Flow edges connecting nodes';
COMMENT ON COLUMN workflow_definitions.is_template IS 'Whether this workflow can be loaded as a template for new workflows';
COMMENT ON COLUMN workflow_definitions.parent_workflow_id IS 'Parent workflow for version tracking';

-- ============================================================================
-- WORKFLOW EVENT TRIGGERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_event_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event configuration
  event_type workflow_event_type NOT NULL,
  event_source VARCHAR(100),            -- 'exotel', 'whatsapp', 'document_upload', 'status_change'
  
  -- Workflow to trigger
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  
  -- Condition for triggering (JSONB expression)
  condition_expression JSONB,           -- {field: 'customer.tier', operator: 'equals', value: 'PREMIUM'}
  
  -- Priority
  priority INTEGER DEFAULT 0,           -- Higher priority triggers execute first
  
  -- Enable/disable
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  description TEXT,
  created_by UUID REFERENCES users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_event_triggers_type ON workflow_event_triggers (event_type) WHERE is_active = true;
CREATE INDEX idx_workflow_event_triggers_workflow ON workflow_event_triggers (workflow_id);
CREATE INDEX idx_workflow_event_triggers_active ON workflow_event_triggers (is_active, priority DESC);

COMMENT ON TABLE workflow_event_triggers IS 'Event-to-workflow mappings for automatic workflow triggering';
COMMENT ON COLUMN workflow_event_triggers.condition_expression IS 'JSONB condition that must be met for trigger to fire';

-- ============================================================================
-- WORKFLOW INSTANCES ENHANCEMENTS
-- ============================================================================

-- Add approval tracking to workflow_instances
ALTER TABLE workflow_instances
ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50),          -- 'PENDING', 'APPROVED', 'REJECTED'
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS auto_decision_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS parent_instance_id UUID REFERENCES workflow_instances(id),  -- For sub-workflows
ADD COLUMN IF NOT EXISTS loop_iteration INTEGER DEFAULT 0,     -- Current loop iteration
ADD COLUMN IF NOT EXISTS loop_context JSONB;                   -- Loop-specific context

CREATE INDEX idx_workflow_instances_approval ON workflow_instances (approval_status) 
  WHERE approval_required = true AND approval_status = 'PENDING';

CREATE INDEX idx_workflow_instances_parent ON workflow_instances (parent_instance_id)
  WHERE parent_instance_id IS NOT NULL;

COMMENT ON COLUMN workflow_instances.approval_required IS 'Whether this workflow instance needs human approval';
COMMENT ON COLUMN workflow_instances.auto_decision_enabled IS 'Whether workflow can make decisions without human approval';
COMMENT ON COLUMN workflow_instances.parent_instance_id IS 'Reference to parent workflow if this is a sub-workflow';
COMMENT ON COLUMN workflow_instances.loop_iteration IS 'Current iteration number for loop nodes';

-- ============================================================================
-- EXOTEL CALL EVENTS TABLE (for missed call tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exotel_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Call identification
  call_sid VARCHAR(100) UNIQUE NOT NULL,
  call_type VARCHAR(50),                -- 'INCOMING', 'OUTGOING', 'MISSED'
  
  -- Participants
  from_number VARCHAR(50),
  to_number VARCHAR(50),
  virtual_number VARCHAR(50),
  
  -- Status
  call_status VARCHAR(50),              -- 'completed', 'missed', 'busy', 'no-answer'
  call_duration INTEGER,                 -- seconds
  
  -- Recording
  recording_url TEXT,
  recording_duration INTEGER,
  
  -- Entity linkage
  customer_id UUID REFERENCES customers(id),
  shipment_id UUID REFERENCES shipments(id),
  workflow_instance_id UUID REFERENCES workflow_instances(id),
  
  -- Metadata
  direction VARCHAR(20),
  custom_field TEXT,
  webhook_payload JSONB,
  
  -- Workflow trigger flag
  workflow_triggered BOOLEAN DEFAULT false,
  workflow_trigger_id UUID REFERENCES workflow_event_triggers(id),
  
  -- Timestamps
  call_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exotel_calls_customer ON exotel_call_events (customer_id);
CREATE INDEX idx_exotel_calls_shipment ON exotel_call_events (shipment_id);
CREATE INDEX idx_exotel_calls_type ON exotel_call_events (call_type, call_status);
CREATE INDEX idx_exotel_calls_missed ON exotel_call_events (call_type, workflow_triggered) 
  WHERE call_type = 'MISSED' AND workflow_triggered = false;
CREATE INDEX idx_exotel_calls_time ON exotel_call_events (call_time DESC);

COMMENT ON TABLE exotel_call_events IS 'Exotel call events including missed calls for workflow triggering';
COMMENT ON COLUMN exotel_call_events.workflow_triggered IS 'Whether this event triggered a workflow';

-- ============================================================================
-- WORKFLOW EXECUTION LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Workflow reference
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  
  -- Node execution details
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(100),
  node_label VARCHAR(255),
  
  -- Execution status
  status VARCHAR(50) NOT NULL,          -- 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED'
  
  -- Data
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  
  -- Human approval tracking
  requires_approval BOOLEAN DEFAULT false,
  approval_granted_by UUID REFERENCES users(id),
  approval_granted_at TIMESTAMPTZ,
  
  -- Execution metadata
  executed_by UUID REFERENCES users(id),  -- NULL for automated execution
  execution_duration_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_exec_log_instance ON workflow_execution_log (workflow_instance_id, started_at DESC);
CREATE INDEX idx_workflow_exec_log_approval ON workflow_execution_log (requires_approval, approval_granted_by)
  WHERE requires_approval = true AND approval_granted_by IS NULL;
CREATE INDEX idx_workflow_exec_log_status ON workflow_execution_log (status);

COMMENT ON TABLE workflow_execution_log IS 'Detailed execution log for each workflow node execution';
COMMENT ON COLUMN workflow_execution_log.requires_approval IS 'Whether this node execution required human approval';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_event_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exotel_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution_log ENABLE ROW LEVEL SECURITY;

-- Workflow Definitions: Admin-only INSERT/UPDATE, all authenticated users can SELECT
DROP POLICY IF EXISTS workflow_defs_select_all ON workflow_definitions;
CREATE POLICY workflow_defs_select_all ON workflow_definitions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS workflow_defs_insert ON workflow_definitions;
CREATE POLICY workflow_defs_insert ON workflow_definitions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS workflow_defs_update ON workflow_definitions;
CREATE POLICY workflow_defs_update ON workflow_definitions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS workflow_defs_delete ON workflow_definitions;
CREATE POLICY workflow_defs_delete ON workflow_definitions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Event Triggers: Admin-only management
DROP POLICY IF EXISTS workflow_event_triggers_select ON workflow_event_triggers;
CREATE POLICY workflow_event_triggers_select ON workflow_event_triggers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS workflow_event_triggers_admin ON workflow_event_triggers;
CREATE POLICY workflow_event_triggers_admin ON workflow_event_triggers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Call Events: All authenticated users
DROP POLICY IF EXISTS exotel_call_events_all ON exotel_call_events;
CREATE POLICY exotel_call_events_all ON exotel_call_events
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Execution Log: All authenticated users (read-only for non-admins)
DROP POLICY IF EXISTS workflow_exec_log_select ON workflow_execution_log;
CREATE POLICY workflow_exec_log_select ON workflow_execution_log
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS workflow_exec_log_insert ON workflow_execution_log;
CREATE POLICY workflow_exec_log_insert ON workflow_execution_log
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Grant access to service role
GRANT ALL ON workflow_definitions TO service_role;
GRANT ALL ON workflow_event_triggers TO service_role;
GRANT ALL ON exotel_call_events TO service_role;
GRANT ALL ON workflow_execution_log TO service_role;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_workflow_defs_updated_at ON workflow_definitions;
CREATE TRIGGER trigger_workflow_defs_updated_at
  BEFORE UPDATE ON workflow_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_workflow_event_triggers_updated_at ON workflow_event_triggers;
CREATE TRIGGER trigger_workflow_event_triggers_updated_at
  BEFORE UPDATE ON workflow_event_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_exotel_call_events_updated_at ON exotel_call_events;
CREATE TRIGGER trigger_exotel_call_events_updated_at
  BEFORE UPDATE ON exotel_call_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to trigger workflows based on events
CREATE OR REPLACE FUNCTION trigger_workflow_on_event(
  p_event_type workflow_event_type,
  p_event_data JSONB,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  workflow_instance_id UUID,
  workflow_name TEXT,
  triggered BOOLEAN
) AS $$
DECLARE
  v_trigger RECORD;
  v_instance_id UUID;
  v_condition_met BOOLEAN;
BEGIN
  -- Find all active triggers for this event type
  FOR v_trigger IN 
    SELECT * FROM workflow_event_triggers 
    WHERE event_type = p_event_type 
      AND is_active = true
    ORDER BY priority DESC
  LOOP
    -- Check if condition is met (simplified - real implementation would eval JSONB expression)
    v_condition_met := true;  -- TODO: Implement condition evaluation
    
    IF v_condition_met THEN
      -- Create workflow instance
      INSERT INTO workflow_instances (
        workflow_id,
        workflow_name,
        shipment_id,
        context,
        status
      ) VALUES (
        v_trigger.workflow_id,
        (SELECT name FROM workflow_definitions WHERE id = v_trigger.workflow_id),
        CASE WHEN p_entity_type = 'SHIPMENT' THEN p_entity_id ELSE NULL END,
        p_event_data,
        'NOT_STARTED'
      ) RETURNING id INTO v_instance_id;
      
      -- Return result
      RETURN QUERY SELECT 
        v_instance_id,
        (SELECT name FROM workflow_definitions WHERE id = v_trigger.workflow_id)::TEXT,
        true;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_workflow_on_event IS 'Automatically trigger workflows based on platform events';

-- Function to increment workflow usage count
CREATE OR REPLACE FUNCTION increment_workflow_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE workflow_definitions
  SET usage_count = usage_count + 1
  WHERE id = NEW.workflow_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workflow_usage_count ON workflow_instances;
CREATE TRIGGER trigger_workflow_usage_count
  AFTER INSERT ON workflow_instances
  FOR EACH ROW
  EXECUTE FUNCTION increment_workflow_usage();

-- ============================================================================
-- COMPLETE
-- ============================================================================

-- Summary comment
COMMENT ON SCHEMA public IS 'Workflow system enhanced with:
- Workflow definitions with visual structure (React Flow)
- Event-driven triggers (document upload, status change, missed calls)
- Admin-only workflow editing via RLS
- Approval mechanisms for agentic control
- Loop support (FOR_EACH, WHILE) via iteration tracking
- Sub-workflow support via parent_instance_id
- Comprehensive execution logging
';
