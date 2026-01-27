-- Migration: 007_freight_workflows.sql
-- Purpose: Create quotations, enhanced shipments, and workflow tracking tables
-- Created: 2026-01-26
-- Author: Claude Sonnet 4.5
-- Dependencies: 001_initial_schema.sql (for users, customers, shipments tables)

-- ============================================================================
-- Custom Types for Freight Workflows
-- ============================================================================

-- Shipment types covering 6 main freight forwarding scenarios
CREATE TYPE shipment_type AS ENUM (
  'AIR_IMPORT',           -- Air freight import
  'AIR_EXPORT',           -- Air freight export
  'ODC_IMPORT',           -- Over-dimensional cargo import
  'ODC_EXPORT',           -- Over-dimensional cargo export
  'BREAK_BULK_IMPORT',    -- Break bulk cargo import
  'BREAK_BULK_EXPORT',    -- Break bulk cargo export
  'SEA_AIR_THIRD_COUNTRY' -- Sea/Air third country shipments
);

-- Shipment stages (12-13 stages per workflow)
CREATE TYPE shipment_stage AS ENUM (
  'QUOTE_REQUEST',        -- Initial quote request
  'QUOTATION',            -- Quotation prepared
  'BOOKING',              -- Booking confirmation
  'DOCUMENTATION',        -- Documentation collection
  'CUSTOMS_CLEARANCE',    -- Customs clearance
  'CARGO_COLLECTION',     -- Cargo collection/pickup
  'IN_TRANSIT',           -- In transit
  'PORT_ARRIVAL',         -- Arrival at port
  'CUSTOMS_DELIVERY',     -- Customs delivery
  'FINAL_DELIVERY',       -- Final delivery to customer
  'POD_COLLECTION',       -- Proof of delivery collection
  'BILLING',              -- Invoice generation
  'CLOSURE'               -- Shipment closed
);

-- Quotation status workflow
CREATE TYPE quotation_status AS ENUM (
  'DRAFT',                -- Draft quotation
  'SENT',                 -- Sent to customer
  'ACCEPTED',             -- Customer accepted
  'REJECTED',             -- Customer rejected
  'EXPIRED',              -- Quotation expired
  'CONVERTED'             -- Converted to shipment
);

-- Document status tracking
CREATE TYPE document_status AS ENUM (
  'PENDING',              -- Document not yet provided
  'UPLOADED',             -- Document uploaded
  'VERIFIED',             -- Document verified
  'REJECTED',             -- Document rejected
  'EXPIRED'               -- Document expired
);

COMMENT ON TYPE shipment_type IS 'Types of shipments handled by the freight forwarding system';
COMMENT ON TYPE shipment_stage IS 'Stages in the shipment lifecycle (Quote → Delivery → Billing → Closure)';
COMMENT ON TYPE quotation_status IS 'Status workflow for quotations';
COMMENT ON TYPE document_status IS 'Status of shipment documents';

-- ============================================================================
-- QUOTATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quote identification
  quote_number VARCHAR(50) UNIQUE NOT NULL,

  -- Customer reference
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),

  -- Shipment details
  shipment_type shipment_type NOT NULL,
  origin_location VARCHAR(255),
  origin_country VARCHAR(100),
  destination_location VARCHAR(255),
  destination_country VARCHAR(100),

  -- Cargo information
  cargo_description TEXT,
  cargo_weight_kg NUMERIC(12,2),
  cargo_volume_cbm NUMERIC(12,2),
  cargo_dimensions JSONB,          -- {length, width, height, unit}
  chargeable_weight NUMERIC(12,2), -- Calculated based on weight vs volumetric

  -- Service requirements
  service_requirements JSONB,      -- {insurance, customs_clearance, door_delivery, etc.}

  -- Pricing
  total_cost NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  cost_breakdown JSONB,            -- {ocean_freight, air_freight, customs, delivery, etc.}

  -- Validity
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,

  -- Status
  status quotation_status DEFAULT 'DRAFT',

  -- Metadata
  notes TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);

COMMENT ON TABLE quotations IS 'Quotations for freight forwarding services';
COMMENT ON COLUMN quotations.quote_number IS 'Unique quote identifier (e.g., QT-20260126-001)';
COMMENT ON COLUMN quotations.chargeable_weight IS 'Calculated weight used for pricing (max of actual weight and volumetric weight)';
COMMENT ON COLUMN quotations.cost_breakdown IS 'Detailed cost breakdown by service component';
COMMENT ON COLUMN quotations.service_requirements IS 'Additional services requested (insurance, customs, delivery, etc.)';

-- ============================================================================
-- ENHANCED SHIPMENTS TABLE (Add new columns to existing table)
-- ============================================================================

-- Add quotation reference
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id),
ADD COLUMN IF NOT EXISTS shipment_type shipment_type,
ADD COLUMN IF NOT EXISTS current_stage shipment_stage DEFAULT 'BOOKING',
ADD COLUMN IF NOT EXISTS workflow_instance_id UUID;

COMMENT ON COLUMN shipments.quotation_id IS 'Reference to the quotation that created this shipment';
COMMENT ON COLUMN shipments.current_stage IS 'Current stage in the shipment workflow';
COMMENT ON COLUMN shipments.workflow_instance_id IS 'Reference to the workflow instance executing this shipment';

-- ============================================================================
-- SHIPMENT STAGE HISTORY (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipment_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shipment reference
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,

  -- Stage transition
  from_stage shipment_stage,
  to_stage shipment_stage NOT NULL,

  -- Metadata
  notes TEXT,
  changed_by UUID REFERENCES users(id),
  duration_in_stage_hours NUMERIC(10,2),  -- Time spent in previous stage

  -- Timestamps
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE shipment_stage_history IS 'Audit trail of shipment stage transitions';
COMMENT ON COLUMN shipment_stage_history.from_stage IS 'Previous stage (NULL if first stage)';
COMMENT ON COLUMN shipment_stage_history.to_stage IS 'New stage';
COMMENT ON COLUMN shipment_stage_history.duration_in_stage_hours IS 'How long the shipment was in the previous stage';

-- ============================================================================
-- SHIPMENT DOCUMENTS (Document Checklist)
-- ============================================================================

CREATE TABLE IF NOT EXISTS shipment_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shipment reference
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,

  -- Document details
  document_type VARCHAR(100) NOT NULL,      -- 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'BOL', etc.
  document_name VARCHAR(255),
  is_mandatory BOOLEAN DEFAULT false,

  -- File information
  file_url TEXT,
  file_size_bytes INTEGER,
  file_mime_type VARCHAR(100),

  -- Status
  status document_status DEFAULT 'PENDING',

  -- Verification
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Metadata
  notes TEXT,
  uploaded_by UUID REFERENCES users(id),

  -- Timestamps
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE shipment_documents IS 'Document checklist and tracking per shipment';
COMMENT ON COLUMN shipment_documents.document_type IS 'Type of document (COMMERCIAL_INVOICE, PACKING_LIST, BOL, COO, etc.)';
COMMENT ON COLUMN shipment_documents.is_mandatory IS 'Whether this document is required for shipment progression';
COMMENT ON COLUMN shipment_documents.file_url IS 'URL to the uploaded document file';

-- ============================================================================
-- WORKFLOW INSTANCES (Track workflow execution)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Workflow reference
  workflow_id UUID NOT NULL,              -- References workflow_definitions table
  workflow_name VARCHAR(255) NOT NULL,

  -- Entity reference
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,

  -- Execution status
  status workflow_instance_status DEFAULT 'NOT_STARTED',
  current_node_id VARCHAR(100),

  -- Context data
  context JSONB DEFAULT '{}'::jsonb,     -- Variables available to workflow
  execution_log JSONB[] DEFAULT ARRAY[]::JSONB[],  -- Execution history

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE workflow_instances IS 'Instances of workflows being executed for shipments/quotations';
COMMENT ON COLUMN workflow_instances.context IS 'Variables available to workflow nodes (customer data, shipment data, etc.)';
COMMENT ON COLUMN workflow_instances.execution_log IS 'Array of execution events for debugging and audit';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Quotations indexes
CREATE INDEX IF NOT EXISTS idx_quotations_customer
  ON quotations(customer_id);

CREATE INDEX IF NOT EXISTS idx_quotations_quote_number
  ON quotations(quote_number);

CREATE INDEX IF NOT EXISTS idx_quotations_status
  ON quotations(status);

CREATE INDEX IF NOT EXISTS idx_quotations_created
  ON quotations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_valid
  ON quotations(valid_until)
  WHERE status = 'SENT';

-- Shipment stage history indexes
CREATE INDEX IF NOT EXISTS idx_stage_history_shipment
  ON shipment_stage_history(shipment_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_stage_history_stage
  ON shipment_stage_history(to_stage);

-- Shipment documents indexes
CREATE INDEX IF NOT EXISTS idx_shipment_docs_shipment
  ON shipment_documents(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_docs_status
  ON shipment_documents(status)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_shipment_docs_mandatory
  ON shipment_documents(shipment_id, is_mandatory)
  WHERE is_mandatory = true AND status = 'PENDING';

-- Workflow instances indexes
CREATE INDEX IF NOT EXISTS idx_workflow_instances_shipment
  ON workflow_instances(shipment_id);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_status
  ON workflow_instances(status)
  WHERE status IN ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED');

-- Enhanced shipment indexes
CREATE INDEX IF NOT EXISTS idx_shipments_quotation
  ON shipments(quotation_id)
  WHERE quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_current_stage
  ON shipments(current_stage);

CREATE INDEX IF NOT EXISTS idx_shipments_workflow_instance
  ON shipments(workflow_instance_id)
  WHERE workflow_instance_id IS NOT NULL;

-- ============================================================================
-- Updated At Triggers
-- ============================================================================

-- Trigger function already exists from migration 006
-- Apply to new tables

DROP TRIGGER IF EXISTS trigger_quotations_updated_at ON quotations;
CREATE TRIGGER trigger_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_shipment_docs_updated_at ON shipment_documents;
CREATE TRIGGER trigger_shipment_docs_updated_at
  BEFORE UPDATE ON shipment_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_workflow_instances_updated_at ON workflow_instances;
CREATE TRIGGER trigger_workflow_instances_updated_at
  BEFORE UPDATE ON workflow_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;

-- Quotations policies (authenticated users can access)
DROP POLICY IF EXISTS "quotations_authenticated_access" ON quotations;
CREATE POLICY "quotations_authenticated_access" ON quotations
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Stage history policies
DROP POLICY IF EXISTS "stage_history_authenticated_access" ON shipment_stage_history;
CREATE POLICY "stage_history_authenticated_access" ON shipment_stage_history
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Document policies
DROP POLICY IF EXISTS "shipment_docs_authenticated_access" ON shipment_documents;
CREATE POLICY "shipment_docs_authenticated_access" ON shipment_documents
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Workflow instance policies
DROP POLICY IF EXISTS "workflow_instances_authenticated_access" ON workflow_instances;
CREATE POLICY "workflow_instances_authenticated_access" ON workflow_instances
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Grant access to service role (for backend operations)
GRANT ALL ON quotations TO service_role;
GRANT ALL ON shipment_stage_history TO service_role;
GRANT ALL ON shipment_documents TO service_role;
GRANT ALL ON workflow_instances TO service_role;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to generate quote number
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  date_str VARCHAR(8);
  seq_num INTEGER;
  quote_num VARCHAR(50);
BEGIN
  -- Format: QT-YYYYMMDD-NNN
  date_str := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Get next sequence number for today
  SELECT COUNT(*) + 1 INTO seq_num
  FROM quotations
  WHERE quote_number LIKE 'QT-' || date_str || '%';

  quote_num := 'QT-' || date_str || '-' || LPAD(seq_num::TEXT, 3, '0');

  RETURN quote_num;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_quote_number() IS 'Generate unique quote number in format QT-YYYYMMDD-NNN';

-- Function to track stage transitions
CREATE OR REPLACE FUNCTION track_stage_transition()
RETURNS TRIGGER AS $$
DECLARE
  prev_stage_entry RECORD;
  hours_in_stage NUMERIC;
BEGIN
  -- Only track if stage actually changed
  IF OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN

    -- Calculate time in previous stage
    SELECT changed_at INTO prev_stage_entry
    FROM shipment_stage_history
    WHERE shipment_id = NEW.id
    ORDER BY changed_at DESC
    LIMIT 1;

    IF prev_stage_entry IS NOT NULL THEN
      hours_in_stage := EXTRACT(EPOCH FROM (NOW() - prev_stage_entry.changed_at)) / 3600;
    END IF;

    -- Insert stage history record
    INSERT INTO shipment_stage_history (
      shipment_id,
      from_stage,
      to_stage,
      duration_in_stage_hours,
      changed_at
    ) VALUES (
      NEW.id,
      OLD.current_stage,
      NEW.current_stage,
      hours_in_stage,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION track_stage_transition() IS 'Automatically track shipment stage transitions';

-- Apply stage tracking trigger to shipments
DROP TRIGGER IF EXISTS trigger_shipment_stage_tracking ON shipments;
CREATE TRIGGER trigger_shipment_stage_tracking
  AFTER UPDATE ON shipments
  FOR EACH ROW
  EXECUTE FUNCTION track_stage_transition();

-- ============================================================================
-- Complete
-- ============================================================================
