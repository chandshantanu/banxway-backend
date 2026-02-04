-- Migration: 011_agent_approval_rules.sql
-- Purpose: Add agent-specific approval rules table
-- Created: 2026-02-04

CREATE TABLE IF NOT EXISTS agent_approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL,
  suggestion_type VARCHAR(50),
  
  -- Thresholds
  auto_approve_threshold NUMERIC(3,2) DEFAULT 0.90,
  require_review_threshold NUMERIC(3,2) DEFAULT 0.70,
  escalate_below_threshold NUMERIC(3,2) DEFAULT 0.50,
  escalate_to_role VARCHAR(50) DEFAULT 'manager',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(agent_id, suggestion_type),
  CONSTRAINT valid_thresholds CHECK (
    auto_approve_threshold >= require_review_threshold AND
    require_review_threshold >= escalate_below_threshold
  )
);

CREATE INDEX idx_agent_rules_agent ON agent_approval_rules(agent_id);

-- Enable RLS
ALTER TABLE agent_approval_rules ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY agent_rules_admin_all ON agent_approval_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE agent_approval_rules IS 'Per-agent confidence threshold configuration';
