-- Migration: 010_workflow_integration_enhancements.sql
-- Purpose: Add integration features for workflows (manual data entry, CRM, KYC, AI automation)
-- Created: 2026-02-04
-- Author: Banxway Development Team
-- Dependencies: 008_workflow_system_enhancements.sql

-- ============================================================================
-- WORKFLOW INTEGRATION ENHANCEMENTS
-- ============================================================================

-- ============================================================================
-- TABLE: workflow_manual_entries
-- Purpose: Store manual data entry forms within workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_manual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id VARCHAR(100) NOT NULL,
  
  -- Form configuration
  form_schema JSONB NOT NULL,  -- JSON Schema for the form
  form_ui_schema JSONB,        -- UI hints for rendering
  
  -- Submission data
  submitted_data JSONB,
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'COMPLETED', 'SKIPPED'
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED'))
);

CREATE INDEX idx_manual_entries_workflow ON workflow_manual_entries(workflow_instance_id);
CREATE INDEX idx_manual_entries_status ON workflow_manual_entries(status);
CREATE INDEX idx_manual_entries_submitted_by ON workflow_manual_entries(submitted_by);

COMMENT ON TABLE workflow_manual_entries IS 'Manual data entry forms for workflow nodes';
COMMENT ON COLUMN workflow_manual_entries.form_schema IS 'JSON Schema defining form structure and validation';
COMMENT ON COLUMN workflow_manual_entries.submitted_data IS 'User-submitted form data';

-- ============================================================================
-- TABLE: workflow_email_triggers
-- Purpose: Configure email-to-workflow automatic mapping
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_email_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  
  -- Email matching criteria
  from_email VARCHAR(255),
  from_domain VARCHAR(255),  -- Match any email from @example.com
  to_email VARCHAR(255),
  subject_contains TEXT[],
  body_keywords TEXT[],
  
  -- Customer matching
  auto_create_customer BOOLEAN DEFAULT false,
  match_customer_by VARCHAR(50) DEFAULT 'email',  -- 'email', 'phone', 'domain'
  
  -- Workflow behavior
  auto_start BOOLEAN DEFAULT false,
  assign_to_role VARCHAR(50),  -- 'agent', 'manager', 'operations'
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  
  -- AI extraction
  extract_data BOOLEAN DEFAULT true,
  extraction_schema JSONB,  -- Schema for what to extract from email
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT'))
);

CREATE INDEX idx_email_triggers_workflow ON workflow_email_triggers(workflow_definition_id);
CREATE INDEX idx_email_triggers_domain ON workflow_email_triggers(from_domain);
CREATE INDEX idx_email_triggers_to_email ON workflow_email_triggers(to_email);
CREATE INDEX idx_email_triggers_active ON workflow_email_triggers(is_active);

COMMENT ON TABLE workflow_email_triggers IS 'Configure automatic workflow triggering from emails';
COMMENT ON COLUMN workflow_email_triggers.from_domain IS 'Match emails from any sender at this domain';
COMMENT ON COLUMN workflow_email_triggers.extraction_schema IS 'JSON schema defining what data to extract from email body';

-- ============================================================================
--  TABLE: workflow_call_triggers
-- Purpose: Configure call-to-workflow automatic mapping
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_call_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  
  -- Call matching criteria
  caller_number VARCHAR(20),
  called_number VARCHAR(20),
  call_direction VARCHAR(10),  -- 'INBOUND', 'OUTBOUND'
  min_duration INTEGER,  -- Minimum call duration in seconds
  
  -- Customer matching
  auto_create_customer BOOLEAN DEFAULT false,
  match_customer_by VARCHAR(50) DEFAULT 'phone',
  
  -- Workflow behavior
  auto_start BOOLEAN DEFAULT false,
  require_manual_entry BOOLEAN DEFAULT true,  -- Prompt agent for call summary
  assign_to_role VARCHAR(50),
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  
  -- Manual entry configuration
  manual_entry_schema JSONB,  -- Form schema for call details
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_call_direction CHECK (call_direction IN ('INBOUND', 'OUTBOUND', 'BOTH')),
  CONSTRAINT valid_call_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT'))
);

CREATE INDEX idx_call_triggers_workflow ON workflow_call_triggers(workflow_definition_id);
CREATE INDEX idx_call_triggers_caller ON workflow_call_triggers(caller_number);
CREATE INDEX idx_call_triggers_called ON workflow_call_triggers(called_number);
CREATE INDEX idx_call_triggers_active ON workflow_call_triggers(is_active);

COMMENT ON TABLE workflow_call_triggers IS 'Configure automatic workflow triggering from phone calls';
COMMENT ON COLUMN workflow_call_triggers.require_manual_entry IS 'Prompt agent to enter call summary before starting workflow';

-- ============================================================================
-- TABLE: workflow_whatsapp_triggers
-- Purpose: Configure WhatsApp-to-workflow automatic mapping
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_whatsapp_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  
  -- WhatsApp matching criteria
  from_number VARCHAR(20),
  to_number VARCHAR(20),  -- Business WhatsApp number
  message_keywords TEXT[],
  
  -- Customer matching
  auto_create_customer BOOLEAN DEFAULT false,
  match_customer_by VARCHAR(50) DEFAULT 'phone',
  
  -- Workflow behavior
  auto_start BOOLEAN DEFAULT false,
  assign_to_role VARCHAR(50),
  priority VARCHAR(20) DEFAULT 'MEDIUM',
  
  -- AI extraction
  extract_data BOOLEAN DEFAULT true,
  extraction_schema JSONB,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_whatsapp_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT'))
);

CREATE INDEX idx_whatsapp_triggers_workflow ON workflow_whatsapp_triggers(workflow_definition_id);
CREATE INDEX idx_whatsapp_triggers_to_number ON workflow_whatsapp_triggers(to_number);
CREATE INDEX idx_whatsapp_triggers_active ON workflow_whatsapp_triggers(is_active);

COMMENT ON TABLE workflow_whatsapp_triggers IS 'Configure automatic workflow triggering from WhatsApp messages';

-- ============================================================================
-- TABLE: workflow_ai_suggestions
-- Purpose: Store AI-generated suggestions for workflow actions
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  node_id VARCHAR(100),
  
  -- Suggestion details
  suggestion_type VARCHAR(50) NOT NULL,  -- 'EMAIL_DRAFT', 'NEXT_STEP', 'DATA_EXTRACTION'
  suggestion_data JSONB NOT NULL,
  confidence_score NUMERIC(3,2),  -- 0.00 to 1.00
  
  -- Guard rails
  guard_rail_checks JSONB,  -- Results of safety checks
  requires_approval BOOLEAN DEFAULT true,
  
  -- Status
  status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'APPROVED', 'REJECTED', 'EDITED'
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Edited version
  edited_data JSONB,  -- If user edited the suggestion
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_suggestion_type CHECK (suggestion_type IN ('EMAIL_DRAFT', 'NEXT_STEP', 'DATA_EXTRACTION', 'QUOTATION_DRAFT', 'DOCUMENT_CLASSIFICATION')),
  CONSTRAINT valid_suggestion_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EDITED')),
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 1)
);

CREATE INDEX idx_ai_suggestions_workflow ON workflow_ai_suggestions(workflow_instance_id);
CREATE INDEX idx_ai_suggestions_status ON workflow_ai_suggestions(status);
CREATE INDEX idx_ai_suggestions_type ON workflow_ai_suggestions(suggestion_type);
CREATE INDEX idx_ai_suggestions_approved_by ON workflow_ai_suggestions(approved_by);

COMMENT ON TABLE workflow_ai_suggestions IS 'AI-generated suggestions requiring human approval';
COMMENT ON COLUMN workflow_ai_suggestions.confidence_score IS 'AI confidence level (0.00-1.00)';
COMMENT ON COLUMN workflow_ai_suggestions.guard_rail_checks IS 'Results of safety and validation checks';

-- ============================================================================
-- TABLE: customer_kyc_documents
-- Purpose: Store KYC documents for customer verification
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Document details
  document_type VARCHAR(50) NOT NULL,  -- 'PAN_CARD', 'GST_CERTIFICATE', 'COMPANY_REGISTRATION'
  document_number VARCHAR(100),
  document_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INTEGER,
  file_type VARCHAR(50),
  
  -- Verification
  uploaded_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'PENDING',  -- 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'
  expiry_date DATE,
  verification_notes TEXT,
  
  -- OCR/Extraction
  extracted_data JSONB,  -- OCR-extracted data from document
  
  -- Timestamps
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_kyc_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  UNIQUE(customer_id, document_type)  -- One document of each type per customer
);

CREATE INDEX idx_kyc_customer ON customer_kyc_documents(customer_id);
CREATE INDEX idx_kyc_status ON customer_kyc_documents(status);
CREATE INDEX idx_kyc_verified_by ON customer_kyc_documents(verified_by);
CREATE INDEX idx_kyc_expiry ON customer_kyc_documents(expiry_date);

COMMENT ON TABLE customer_kyc_documents IS 'KYC documents for customer verification';
COMMENT ON COLUMN customer_kyc_documents.extracted_data IS 'OCR-extracted data from document image';

-- ============================================================================
-- TABLE: email_workflow_mappings
-- Purpose: Log which emails triggered which workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_workflow_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  email_id UUID,  -- Reference to emails table (if exists)
  workflow_instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES workflow_email_triggers(id),
  
  -- Email details
  from_email VARCHAR(255),
  to_email VARCHAR(255),
  subject TEXT,
  
  -- Extraction results
  extracted_data JSONB,
  extraction_confidence NUMERIC(3,2),
  
  -- Trigger results
  auto_started BOOLEAN DEFAULT false,
  created_customer_id UUID REFERENCES customers(id),  -- If customer was auto-created
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_mappings_workflow ON email_workflow_mappings(workflow_instance_id);
CREATE INDEX idx_email_mappings_trigger ON email_workflow_mappings(trigger_id);
CREATE INDEX idx_email_mappings_from ON email_workflow_mappings(from_email);
CREATE INDEX idx_email_mappings_customer ON email_workflow_mappings(created_customer_id);

COMMENT ON TABLE email_workflow_mappings IS 'Audit log of email-triggered workflow instances';

-- ============================================================================
-- UPDATE TRIGGER FUNCTIONS
-- ============================================================================

-- Updated_at trigger function for all new tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_manual_entries_updated_at ON workflow_manual_entries;
CREATE TRIGGER update_manual_entries_updated_at
  BEFORE UPDATE ON workflow_manual_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_triggers_updated_at ON workflow_email_triggers;
CREATE TRIGGER update_email_triggers_updated_at
  BEFORE UPDATE ON workflow_email_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_call_triggers_updated_at ON workflow_call_triggers;
CREATE TRIGGER update_call_triggers_updated_at
  BEFORE UPDATE ON workflow_call_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_triggers_updated_at ON workflow_whatsapp_triggers;
CREATE TRIGGER update_whatsapp_triggers_updated_at
  BEFORE UPDATE ON workflow_whatsapp_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_suggestions_updated_at ON workflow_ai_suggestions;
CREATE TRIGGER update_ai_suggestions_updated_at
  BEFORE UPDATE ON workflow_ai_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kyc_documents_updated_at ON customer_kyc_documents;
CREATE TRIGGER update_kyc_documents_updated_at
  BEFORE UPDATE ON customer_kyc_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workflow_manual_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_email_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_call_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_whatsapp_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_workflow_mappings ENABLE ROW LEVEL SECURITY;

-- Manual Entries: Users can view/submit their assigned entries
CREATE POLICY manual_entries_select_all ON workflow_manual_entries
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY manual_entries_insert_own ON workflow_manual_entries
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY manual_entries_update_own ON workflow_manual_entries
  FOR UPDATE
  USING (submitted_by = auth.uid() OR submitted_by IS NULL);

-- Email Triggers: Only admins can configure
CREATE POLICY email_triggers_select_all ON workflow_email_triggers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY email_triggers_admin_all ON workflow_email_triggers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Call Triggers: Only admins can configure
CREATE POLICY call_triggers_select_all ON workflow_call_triggers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY call_triggers_admin_all ON workflow_call_triggers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- WhatsApp Triggers: Only admins can configure
CREATE POLICY whatsapp_triggers_select_all ON workflow_whatsapp_triggers
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY whatsapp_triggers_admin_all ON workflow_whatsapp_triggers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- AI Suggestions: Users can view/approve their assigned suggestions
CREATE POLICY ai_suggestions_select_all ON workflow_ai_suggestions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY ai_suggestions_update_own ON workflow_ai_suggestions
  FOR UPDATE
  USING (
    approved_by = auth.uid() OR approved_by IS NULL
  );

-- KYC Documents: Users can view/upload for their customers, admins can verify
CREATE POLICY kyc_docs_select_all ON customer_kyc_documents
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY kyc_docs_insert_auth ON customer_kyc_documents
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY kyc_docs_update_verifier ON customer_kyc_documents
  FOR UPDATE
  USING (
    verified_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Email Mappings: All authenticated users can view
CREATE POLICY email_mappings_select_all ON email_workflow_mappings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY email_mappings_insert_system ON email_workflow_mappings
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if customer has valid KYC
CREATE OR REPLACE FUNCTION check_customer_kyc_status(p_customer_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  v_required_docs TEXT[] := ARRAY['PAN_CARD', 'GST_CERTIFICATE'];
  v_doc_count INTEGER;
  v_approved_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'APPROVED')
  INTO v_doc_count, v_approved_count
  FROM customer_kyc_documents
  WHERE customer_id = p_customer_id
    AND document_type = ANY(v_required_docs)
    AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE);
  
  IF v_approved_count >= array_length(v_required_docs, 1) THEN
    RETURN 'APPROVED';
  ELSIF v_doc_count > 0 THEN
    RETURN 'PENDING';
  ELSE
    RETURN 'NOT_STARTED';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_customer_kyc_status IS 'Check if customer has all required KYC documents approved';

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Uncomment to insert sample email trigger for testing
/*
INSERT INTO workflow_email_triggers (
  workflow_definition_id,
  from_domain,
  to_email,
  subject_contains,
  auto_create_customer,
  auto_start,
  extract_data,
  extraction_schema
) VALUES (
  (SELECT id FROM workflow_definitions WHERE name LIKE 'Air Import%' LIMIT 1),
  '@test-importer.com',
  'operations@banxway.com',
  ARRAY['RFQ', 'Quote Request'],
  true,
  false,
  true,
  '{
    "origin": "string",
    "destination": "string",
    "cargo_weight": "number",
    "urgency": "string"
  }'::jsonb
);
*/

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Success message
DO $$ BEGIN
  RAISE NOTICE 'Migration 010_workflow_integration_enhancements.sql completed successfully!';
  RAISE NOTICE 'Created tables: workflow_manual_entries, workflow_email_triggers, workflow_call_triggers, workflow_whatsapp_triggers, workflow_ai_suggestions, customer_kyc_documents, email_workflow_mappings';
  RAISE NOTICE 'RLS policies enabled on all tables';
END $$;
