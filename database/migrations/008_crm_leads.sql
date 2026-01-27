-- Migration: 008_crm_leads.sql
-- Purpose: Create CRM customer and lead management tables
-- Created: 2026-01-26
-- Author: Claude Sonnet 4.5
-- Dependencies: 001_initial_schema.sql (for users table)

-- ============================================================================
-- Custom Types for CRM
-- ============================================================================

-- Customer/Lead status workflow
CREATE TYPE crm_customer_status AS ENUM (
  'LEAD',                 -- New lead/prospect
  'QUALIFIED',            -- Qualified lead
  'ACTIVE',               -- Active customer
  'INACTIVE',             -- Inactive customer
  'CHURNED',              -- Lost customer
  'BLACKLISTED'           -- Blacklisted
);

-- KYC verification status
CREATE TYPE kyc_status AS ENUM (
  'PENDING',              -- KYC not started
  'IN_PROGRESS',          -- KYC documents being verified
  'VERIFIED',             -- KYC completed and verified
  'REJECTED',             -- KYC rejected
  'EXPIRED'               -- KYC verification expired
);

-- Credit terms
CREATE TYPE credit_terms AS ENUM (
  'ADVANCE',              -- 100% advance payment
  'NET_7',                -- Payment within 7 days
  'NET_15',               -- Payment within 15 days
  'NET_30',               -- Payment within 30 days
  'NET_45',               -- Payment within 45 days
  'NET_60',               -- Payment within 60 days
  'COD'                   -- Cash on delivery
);

COMMENT ON TYPE crm_customer_status IS 'Customer lifecycle status (Lead → Qualified → Active → Inactive/Churned)';
COMMENT ON TYPE kyc_status IS 'KYC (Know Your Customer) verification status';
COMMENT ON TYPE credit_terms IS 'Payment terms offered to customer';

-- ============================================================================
-- CRM CUSTOMERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer identification
  customer_code VARCHAR(50) UNIQUE NOT NULL,

  -- Company information
  legal_name VARCHAR(255) NOT NULL,
  trading_name VARCHAR(255),
  company_type VARCHAR(100),        -- 'PROPRIETORSHIP', 'PARTNERSHIP', 'PVT_LTD', 'PUBLIC_LTD', etc.

  -- Contact information
  primary_email VARCHAR(255),
  primary_phone VARCHAR(50),
  website VARCHAR(255),

  -- Address
  billing_address JSONB,            -- {street, city, state, country, postal_code}
  shipping_address JSONB,           -- {street, city, state, country, postal_code}

  -- Compliance (India-specific)
  gst_number VARCHAR(50),           -- Goods and Services Tax Number
  pan_number VARCHAR(50),           -- Permanent Account Number
  iec_number VARCHAR(50),           -- Import Export Code
  tan_number VARCHAR(50),           -- Tax Deduction Account Number

  -- Business details
  industry VARCHAR(100),
  annual_revenue_usd NUMERIC(15,2),
  employee_count INTEGER,

  -- Relationship
  customer_tier customer_tier DEFAULT 'NEW',
  status crm_customer_status DEFAULT 'LEAD',
  kyc_status kyc_status DEFAULT 'PENDING',

  -- Credit management
  credit_terms credit_terms DEFAULT 'ADVANCE',
  credit_limit_usd NUMERIC(12,2),
  outstanding_balance_usd NUMERIC(12,2) DEFAULT 0,

  -- Account management
  account_manager UUID REFERENCES users(id),
  sales_representative UUID REFERENCES users(id),
  customer_success_manager UUID REFERENCES users(id),

  -- Lead source
  lead_source VARCHAR(100),         -- 'WEBSITE', 'REFERRAL', 'COLD_CALL', 'TRADE_SHOW', etc.
  lead_notes TEXT,

  -- Metadata
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  custom_fields JSONB DEFAULT '{}'::jsonb,
  internal_notes TEXT,

  -- Integration IDs
  espocrm_account_id VARCHAR(100),  -- EspoCRM Account ID
  quickbooks_id VARCHAR(100),       -- QuickBooks Customer ID

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ,
  converted_to_customer_at TIMESTAMPTZ,  -- When lead became customer
  kyc_verified_at TIMESTAMPTZ
);

COMMENT ON TABLE crm_customers IS 'CRM customers and leads with full business information';
COMMENT ON COLUMN crm_customers.customer_code IS 'Unique customer identifier (e.g., CUST-2026-001)';
COMMENT ON COLUMN crm_customers.gst_number IS 'Indian GST Number (15 characters)';
COMMENT ON COLUMN crm_customers.iec_number IS 'Import Export Code required for international trade';
COMMENT ON COLUMN crm_customers.billing_address IS 'Billing address as JSON object';
COMMENT ON COLUMN crm_customers.shipping_address IS 'Shipping address as JSON object';
COMMENT ON COLUMN crm_customers.credit_limit_usd IS 'Maximum credit allowed for this customer';
COMMENT ON COLUMN crm_customers.espocrm_account_id IS 'Reference to EspoCRM Account for sync';

-- ============================================================================
-- CRM CONTACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer reference
  customer_id UUID NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,

  -- Contact information
  full_name VARCHAR(255) NOT NULL,
  designation VARCHAR(100),
  department VARCHAR(100),

  -- Contact details
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  whatsapp VARCHAR(50),

  -- Preferences
  preferred_channel channel_type,
  is_primary BOOLEAN DEFAULT false,
  is_decision_maker BOOLEAN DEFAULT false,
  can_sign_documents BOOLEAN DEFAULT false,

  -- Contact quality
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,

  -- Metadata
  notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Integration IDs
  espocrm_contact_id VARCHAR(100),  -- EspoCRM Contact ID

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ
);

COMMENT ON TABLE crm_contacts IS 'Contact persons associated with CRM customers';
COMMENT ON COLUMN crm_contacts.is_primary IS 'Primary contact for this customer';
COMMENT ON COLUMN crm_contacts.is_decision_maker IS 'Can make purchase decisions';
COMMENT ON COLUMN crm_contacts.can_sign_documents IS 'Authorized to sign legal documents';

-- ============================================================================
-- CUSTOMER INTERACTIONS (Track all touchpoints)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer/Contact reference
  customer_id UUID NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,

  -- Interaction details
  interaction_type VARCHAR(100) NOT NULL,  -- 'CALL', 'EMAIL', 'MEETING', 'QUOTE_SENT', 'SHIPMENT_DELIVERED', etc.
  channel channel_type,
  subject VARCHAR(255),
  description TEXT,

  -- Outcome
  outcome VARCHAR(100),             -- 'POSITIVE', 'NEGATIVE', 'NEUTRAL', 'FOLLOW_UP_REQUIRED'
  next_action VARCHAR(255),
  next_action_due_date DATE,

  -- References
  thread_id UUID,                   -- Link to communication thread if applicable
  quotation_id UUID,                -- Link to quotation if applicable
  shipment_id UUID,                 -- Link to shipment if applicable

  -- Metadata
  interaction_data JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),

  -- Timestamps
  interaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE customer_interactions IS 'Log of all customer interactions for relationship tracking';
COMMENT ON COLUMN customer_interactions.interaction_type IS 'Type of interaction (CALL, EMAIL, MEETING, QUOTE_SENT, etc.)';
COMMENT ON COLUMN customer_interactions.outcome IS 'Result of the interaction (POSITIVE, NEGATIVE, FOLLOW_UP_REQUIRED, etc.)';

-- ============================================================================
-- CUSTOMER DOCUMENTS (KYC and Legal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer reference
  customer_id UUID NOT NULL REFERENCES crm_customers(id) ON DELETE CASCADE,

  -- Document details
  document_type VARCHAR(100) NOT NULL,  -- 'GST_CERTIFICATE', 'PAN_CARD', 'IEC_CERTIFICATE', etc.
  document_name VARCHAR(255),
  document_number VARCHAR(100),         -- Document ID/number

  -- File information
  file_url TEXT,
  file_size_bytes INTEGER,
  file_mime_type VARCHAR(100),

  -- Validity
  issue_date DATE,
  expiry_date DATE,
  is_expired BOOLEAN GENERATED ALWAYS AS (expiry_date < CURRENT_DATE) STORED,

  -- Verification
  verification_status document_status DEFAULT 'PENDING',
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

COMMENT ON TABLE customer_documents IS 'KYC and legal documents for customers';
COMMENT ON COLUMN customer_documents.document_type IS 'Type of document (GST_CERTIFICATE, PAN_CARD, IEC_CERTIFICATE, etc.)';
COMMENT ON COLUMN customer_documents.is_expired IS 'Auto-calculated based on expiry_date';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- CRM Customers indexes
CREATE INDEX IF NOT EXISTS idx_crm_customers_code
  ON crm_customers(customer_code);

CREATE INDEX IF NOT EXISTS idx_crm_customers_status
  ON crm_customers(status);

CREATE INDEX IF NOT EXISTS idx_crm_customers_tier
  ON crm_customers(customer_tier);

CREATE INDEX IF NOT EXISTS idx_crm_customers_email
  ON crm_customers(primary_email)
  WHERE primary_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_customers_gst
  ON crm_customers(gst_number)
  WHERE gst_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_customers_account_manager
  ON crm_customers(account_manager)
  WHERE account_manager IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_customers_tags
  ON crm_customers USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_crm_customers_kyc_pending
  ON crm_customers(kyc_status)
  WHERE kyc_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_crm_customers_espocrm
  ON crm_customers(espocrm_account_id)
  WHERE espocrm_account_id IS NOT NULL;

-- CRM Contacts indexes
CREATE INDEX IF NOT EXISTS idx_crm_contacts_customer
  ON crm_contacts(customer_id);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email
  ON crm_contacts(email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_primary
  ON crm_contacts(customer_id, is_primary)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_espocrm
  ON crm_contacts(espocrm_contact_id)
  WHERE espocrm_contact_id IS NOT NULL;

-- Customer Interactions indexes
CREATE INDEX IF NOT EXISTS idx_interactions_customer
  ON customer_interactions(customer_id, interaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_contact
  ON customer_interactions(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_type
  ON customer_interactions(interaction_type);

CREATE INDEX IF NOT EXISTS idx_interactions_next_action
  ON customer_interactions(next_action_due_date)
  WHERE next_action_due_date IS NOT NULL AND outcome = 'FOLLOW_UP_REQUIRED';

-- Customer Documents indexes
CREATE INDEX IF NOT EXISTS idx_customer_docs_customer
  ON customer_documents(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_docs_type
  ON customer_documents(document_type);

CREATE INDEX IF NOT EXISTS idx_customer_docs_expired
  ON customer_documents(customer_id, is_expired)
  WHERE is_expired = true;

CREATE INDEX IF NOT EXISTS idx_customer_docs_pending_verification
  ON customer_documents(verification_status)
  WHERE verification_status = 'PENDING';

-- ============================================================================
-- Updated At Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_crm_customers_updated_at ON crm_customers;
CREATE TRIGGER trigger_crm_customers_updated_at
  BEFORE UPDATE ON crm_customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_crm_contacts_updated_at ON crm_contacts;
CREATE TRIGGER trigger_crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_customer_interactions_updated_at ON customer_interactions;
CREATE TRIGGER trigger_customer_interactions_updated_at
  BEFORE UPDATE ON customer_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_customer_docs_updated_at ON customer_documents;
CREATE TRIGGER trigger_customer_docs_updated_at
  BEFORE UPDATE ON customer_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

-- CRM Customers policies (authenticated users can access)
DROP POLICY IF EXISTS "crm_customers_authenticated_access" ON crm_customers;
CREATE POLICY "crm_customers_authenticated_access" ON crm_customers
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- CRM Contacts policies
DROP POLICY IF EXISTS "crm_contacts_authenticated_access" ON crm_contacts;
CREATE POLICY "crm_contacts_authenticated_access" ON crm_contacts
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Customer Interactions policies
DROP POLICY IF EXISTS "customer_interactions_authenticated_access" ON customer_interactions;
CREATE POLICY "customer_interactions_authenticated_access" ON customer_interactions
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Customer Documents policies
DROP POLICY IF EXISTS "customer_docs_authenticated_access" ON customer_documents;
CREATE POLICY "customer_docs_authenticated_access" ON customer_documents
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Grant access to service role
GRANT ALL ON crm_customers TO service_role;
GRANT ALL ON crm_contacts TO service_role;
GRANT ALL ON customer_interactions TO service_role;
GRANT ALL ON customer_documents TO service_role;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to generate customer code
CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS VARCHAR(50) AS $$
DECLARE
  year_str VARCHAR(4);
  seq_num INTEGER;
  cust_code VARCHAR(50);
BEGIN
  -- Format: CUST-YYYY-NNNN
  year_str := TO_CHAR(NOW(), 'YYYY');

  -- Get next sequence number for this year
  SELECT COUNT(*) + 1 INTO seq_num
  FROM crm_customers
  WHERE customer_code LIKE 'CUST-' || year_str || '%';

  cust_code := 'CUST-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');

  RETURN cust_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_customer_code() IS 'Generate unique customer code in format CUST-YYYY-NNNN';

-- Function to update last interaction timestamp
CREATE OR REPLACE FUNCTION update_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_customers
  SET last_interaction_at = NEW.interaction_date
  WHERE id = NEW.customer_id;

  IF NEW.contact_id IS NOT NULL THEN
    UPDATE crm_contacts
    SET last_contacted_at = NEW.interaction_date
    WHERE id = NEW.contact_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_last_interaction() IS 'Update last_interaction_at timestamp when interaction is logged';

-- Apply interaction tracking trigger
DROP TRIGGER IF EXISTS trigger_update_last_interaction ON customer_interactions;
CREATE TRIGGER trigger_update_last_interaction
  AFTER INSERT ON customer_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_interaction();

-- ============================================================================
-- Complete
-- ============================================================================
