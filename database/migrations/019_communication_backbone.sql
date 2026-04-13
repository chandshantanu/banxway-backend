-- Migration 019: Communication Backbone Upgrade
-- Adds entity types, pipeline stages, pending contacts, thread participants
-- Part of the Communication Backbone redesign (14 phases)

-- 1. Add entity_type to CRM customers
ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'CUSTOMER'
  CHECK (entity_type IN ('CUSTOMER', 'AGENCY', 'FREIGHT_FORWARDER', 'SUPPLIER', 'INTERNAL', 'OTHER'));
CREATE INDEX IF NOT EXISTS idx_crm_customers_entity_type ON crm_customers(entity_type);

-- 2. Add pipeline stage to communication threads
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50)
  CHECK (pipeline_stage IN ('INTAKE', 'QUALIFICATION', 'QUOTE', 'NEGOTIATION', 'ORDER', 'EXECUTION', 'POST_DELIVERY', 'CLOSED'));
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_threads_pipeline_stage ON communication_threads(pipeline_stage) WHERE pipeline_stage IS NOT NULL;

-- 3. Ensure correlation fields exist (some may already exist from migration 013)
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS crm_customer_id UUID REFERENCES crm_customers(id);
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS lead_classification VARCHAR(50);
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS correlation_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE communication_threads ADD COLUMN IF NOT EXISTS correlated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_threads_crm_customer ON communication_threads(crm_customer_id) WHERE crm_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_lead_classification ON communication_threads(lead_classification) WHERE lead_classification IS NOT NULL;

-- 4. Pending contacts table (approval queue for unknown senders)
CREATE TABLE IF NOT EXISTS pending_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  domain VARCHAR(255),
  suggested_entity_type VARCHAR(50) DEFAULT 'CUSTOMER',
  suggested_classification VARCHAR(50),
  first_seen_thread_id UUID REFERENCES communication_threads(id),
  thread_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'MERGED', 'SPAM')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_crm_customer_id UUID REFERENCES crm_customers(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_contacts_email ON pending_contacts(email);
CREATE INDEX IF NOT EXISTS idx_pending_contacts_status ON pending_contacts(status);
CREATE INDEX IF NOT EXISTS idx_pending_contacts_domain ON pending_contacts(domain);

-- 5. Thread participants table (multi-party attribution)
CREATE TABLE IF NOT EXISTS thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  crm_customer_id UUID REFERENCES crm_customers(id),
  pending_contact_id UUID REFERENCES pending_contacts(id),
  contact_email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'PARTICIPANT' CHECK (role IN ('PRIMARY', 'CC', 'BCC', 'FORWARDED', 'MENTIONED', 'PARTICIPANT')),
  entity_type VARCHAR(50) CHECK (entity_type IN ('CUSTOMER', 'AGENCY', 'FREIGHT_FORWARDER', 'SUPPLIER', 'INTERNAL', 'OTHER')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(thread_id, contact_email)
);
CREATE INDEX IF NOT EXISTS idx_thread_participants_thread ON thread_participants(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_email ON thread_participants(contact_email);
CREATE INDEX IF NOT EXISTS idx_thread_participants_crm ON thread_participants(crm_customer_id) WHERE crm_customer_id IS NOT NULL;

-- 6. Tag legacy CRM data (idempotent)
UPDATE crm_customers
SET lead_notes = 'LEGACY_AUTO_CREATED: ' || COALESCE(lead_notes, '')
WHERE lead_source = 'email_inbound'
  AND (lead_notes IS NULL OR lead_notes NOT LIKE 'LEGACY_AUTO_CREATED%');
