-- Migration: 009_validation.sql
-- Purpose: Human validation queue and client approval tracking (L5 agent layer)
-- Created: 2026-02-26
-- Dependencies: 008_shipment_pipeline.sql

-- Human validation review queue
CREATE TABLE IF NOT EXISTS validation_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_request_id UUID REFERENCES shipment_requests(id) ON DELETE CASCADE,
  -- Queue metadata
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_review', 'completed', 'escalated')
  ),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  reason TEXT,
  -- What needs to be reviewed
  validation_data JSONB DEFAULT '{}',
  -- Review outcome
  decision VARCHAR(50) CHECK (
    decision IN ('approved', 'rejected', 'revision_needed', 'escalated')
  ),
  reviewed_by VARCHAR(255),
  review_notes TEXT,
  -- Timing
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- SLA tracking
  sla_due_at TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT FALSE,
  -- AgentBuilder metadata
  agent_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client approval tracking (sent to shipper/consignee for confirmation)
CREATE TABLE IF NOT EXISTS client_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_request_id UUID REFERENCES shipment_requests(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL,
  -- Approval request
  approval_type VARCHAR(50) NOT NULL CHECK (
    approval_type IN ('quote_acceptance', 'booking_confirmation', 'document_sign_off', 'rate_confirmation')
  ),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'approved', 'rejected', 'expired')
  ),
  -- Client details
  client_email VARCHAR(255),
  client_name VARCHAR(255),
  -- Content sent to client
  approval_data JSONB DEFAULT '{}',
  message_sent TEXT,
  -- Response
  client_response TEXT,
  response_channel VARCHAR(50),
  -- Timing
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  -- AgentBuilder metadata
  agent_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_validation_reviews_shipment ON validation_reviews(shipment_request_id);
CREATE INDEX IF NOT EXISTS idx_validation_reviews_status ON validation_reviews(status);
CREATE INDEX IF NOT EXISTS idx_validation_reviews_priority ON validation_reviews(priority);
CREATE INDEX IF NOT EXISTS idx_validation_reviews_requested_at ON validation_reviews(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_reviews_sla_due ON validation_reviews(sla_due_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_client_approvals_shipment ON client_approvals(shipment_request_id);
CREATE INDEX IF NOT EXISTS idx_client_approvals_thread ON client_approvals(thread_id);
CREATE INDEX IF NOT EXISTS idx_client_approvals_status ON client_approvals(status);
CREATE INDEX IF NOT EXISTS idx_client_approvals_created_at ON client_approvals(created_at DESC);

-- Auto-update triggers
DROP TRIGGER IF EXISTS validation_reviews_updated_at ON validation_reviews;
CREATE TRIGGER validation_reviews_updated_at
  BEFORE UPDATE ON validation_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS client_approvals_updated_at ON client_approvals;
CREATE TRIGGER client_approvals_updated_at
  BEFORE UPDATE ON client_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (staff can see all, clients only see their own)
ALTER TABLE validation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_approvals ENABLE ROW LEVEL SECURITY;

-- Staff can access all validation reviews
CREATE POLICY "staff_can_manage_validation_reviews"
  ON validation_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'agent', 'ops_staff')
    )
  );

-- Staff can access all client approvals
CREATE POLICY "staff_can_manage_client_approvals"
  ON client_approvals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'agent', 'ops_staff')
    )
  );
