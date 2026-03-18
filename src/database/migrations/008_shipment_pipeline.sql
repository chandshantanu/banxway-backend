-- Migration: 008_shipment_pipeline.sql
-- Purpose: Agent-created shipment requests and rate quotes
-- Created: 2026-02-26
-- Dependencies: 007_agent_pipeline.sql, 001_initial_schema.sql

-- Shipment requests (created by L4 Shipment Request agent)
CREATE TABLE IF NOT EXISTS shipment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL,
  -- Parties
  shipper VARCHAR(500),
  consignee VARCHAR(500),
  notify_party VARCHAR(500),
  -- Route
  port_of_loading VARCHAR(255),
  port_of_discharge VARCHAR(255),
  origin_country VARCHAR(100),
  destination_country VARCHAR(100),
  -- Cargo
  commodity TEXT,
  hs_codes TEXT[],
  package_type VARCHAR(100),
  quantity INTEGER,
  gross_weight VARCHAR(100),
  net_weight VARCHAR(100),
  volume VARCHAR(100),
  -- Incoterms & references
  incoterms VARCHAR(50),
  bl_number VARCHAR(255),
  po_number VARCHAR(255),
  reference_number VARCHAR(255),
  -- AI extraction metadata
  extraction_confidence FLOAT,
  extracted_from_document_id VARCHAR(255),
  agent_id VARCHAR(255),
  -- Status & validation
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_validation', 'approved', 'rejected', 'processing', 'completed', 'cancelled')
  ),
  validated_by VARCHAR(255),
  validated_at TIMESTAMPTZ,
  validation_notes TEXT,
  -- Timestamps
  agent_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate quotes (created by L4 Rate Quote agent)
CREATE TABLE IF NOT EXISTS rate_quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL,
  shipment_request_id UUID REFERENCES shipment_requests(id) ON DELETE SET NULL,
  -- Quote details
  carrier VARCHAR(255),
  service_type VARCHAR(100),
  transit_time_days INTEGER,
  validity_date DATE,
  -- Pricing
  freight_rate DECIMAL(12, 2),
  freight_currency VARCHAR(10) DEFAULT 'USD',
  total_charges JSONB DEFAULT '[]',
  -- AI metadata
  agent_id VARCHAR(255),
  confidence FLOAT,
  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent_to_client', 'accepted', 'rejected', 'expired')
  ),
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shipment_requests_thread ON shipment_requests(thread_id);
CREATE INDEX IF NOT EXISTS idx_shipment_requests_status ON shipment_requests(status);
CREATE INDEX IF NOT EXISTS idx_shipment_requests_created_at ON shipment_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_requests_pol_pod ON shipment_requests(port_of_loading, port_of_discharge);

CREATE INDEX IF NOT EXISTS idx_rate_quotes_thread ON rate_quotes(thread_id);
CREATE INDEX IF NOT EXISTS idx_rate_quotes_shipment ON rate_quotes(shipment_request_id);
CREATE INDEX IF NOT EXISTS idx_rate_quotes_status ON rate_quotes(status);
CREATE INDEX IF NOT EXISTS idx_rate_quotes_created_at ON rate_quotes(created_at DESC);

-- Auto-update triggers
DROP TRIGGER IF EXISTS shipment_requests_updated_at ON shipment_requests;
CREATE TRIGGER shipment_requests_updated_at
  BEFORE UPDATE ON shipment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS rate_quotes_updated_at ON rate_quotes;
CREATE TRIGGER rate_quotes_updated_at
  BEFORE UPDATE ON rate_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
