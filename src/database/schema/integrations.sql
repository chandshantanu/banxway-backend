-- Integration credentials storage (encrypted)
-- This table stores encrypted credentials for various integrations (Exotel, Zoho, etc.)

CREATE TABLE IF NOT EXISTS integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Integration type: 'exotel_phone', 'exotel_whatsapp', 'exotel_sms', 'zoho_mail'
  integration_type VARCHAR(50) NOT NULL,

  -- Encrypted credential fields (AES-256 encrypted JSON)
  credentials_encrypted TEXT NOT NULL,

  -- Metadata (non-sensitive)
  display_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  last_verified_at TIMESTAMPTZ,

  -- Audit
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, integration_type)
);

-- User-level integration permissions
CREATE TABLE IF NOT EXISTS user_integration_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  integration_id UUID NOT NULL REFERENCES integration_credentials(id) ON DELETE CASCADE,

  -- Permission levels
  can_view BOOLEAN DEFAULT false,
  can_send BOOLEAN DEFAULT false,      -- Can send emails/messages/calls
  can_configure BOOLEAN DEFAULT false, -- Can modify settings (admin only)

  -- Restrictions
  daily_limit INTEGER,                 -- Max operations per day
  monthly_limit INTEGER,               -- Max operations per month

  -- Audit
  granted_by UUID,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(user_id, integration_id)
);

-- Audit log for all integration operations
CREATE TABLE IF NOT EXISTS integration_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID,
  integration_type VARCHAR(50) NOT NULL,

  action VARCHAR(100) NOT NULL,        -- 'credential_created', 'email_sent', 'call_made', etc.
  status VARCHAR(50) NOT NULL,         -- 'success', 'failed', 'pending'
  details JSONB,                       -- Additional context

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phone numbers from Exotel
CREATE TABLE IF NOT EXISTS organization_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  integration_id UUID REFERENCES integration_credentials(id) ON DELETE CASCADE,

  -- Number info
  phone_number VARCHAR(20) NOT NULL,
  display_name VARCHAR(100),
  number_type VARCHAR(50), -- 'virtual', 'toll-free', 'local'

  -- Assignment
  assigned_to_user_id UUID,
  is_primary BOOLEAN DEFAULT false,

  -- Capabilities
  can_call BOOLEAN DEFAULT true,
  can_sms BOOLEAN DEFAULT true,

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, phone_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integration_credentials_org ON integration_credentials(organization_id);
CREATE INDEX IF NOT EXISTS idx_integration_credentials_type ON integration_credentials(integration_type);
CREATE INDEX IF NOT EXISTS idx_integration_permissions_user ON user_integration_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_org_time ON integration_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_org ON organization_phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_assigned ON organization_phone_numbers(assigned_to_user_id);
