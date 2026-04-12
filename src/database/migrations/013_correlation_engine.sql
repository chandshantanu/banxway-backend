-- Migration: 013_correlation_engine.sql
-- Purpose: Add columns needed by the correlation engine to link threads to CRM customers
--          and classify communications as new leads vs existing customer/shipment updates.
-- Created: 2026-04-12

-- Add CRM linkage + lead classification to communication_threads
ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS crm_customer_id UUID REFERENCES crm_customers(id),
  ADD COLUMN IF NOT EXISTS lead_classification VARCHAR(30)
    CHECK (lead_classification IN ('new_lead', 'existing_customer', 'existing_shipment', 'unknown')),
  ADD COLUMN IF NOT EXISTS correlation_status VARCHAR(20)
    CHECK (correlation_status IN ('pending', 'matched', 'created', 'failed'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS correlated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_threads_crm_customer
  ON communication_threads(crm_customer_id)
  WHERE crm_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_lead_classification
  ON communication_threads(lead_classification)
  WHERE lead_classification IS NOT NULL;

-- Also add crm_customer_id to shipment_requests so approved requests
-- are linked to the right CRM customer
ALTER TABLE shipment_requests
  ADD COLUMN IF NOT EXISTS crm_customer_id UUID REFERENCES crm_customers(id);
