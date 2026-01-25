-- Migration: 006_integrations.sql
-- Purpose: Create tables for integration credentials (Exotel, Zoho, etc.)
-- Created: 2026-01-25
-- Dependencies: 001_initial_schema.sql (for users table)

-- ============================================================================
-- Integration Credentials Storage (Encrypted)
-- ============================================================================

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

  CONSTRAINT unique_org_integration UNIQUE(organization_id, integration_type)
);

COMMENT ON TABLE integration_credentials IS 'Stores encrypted credentials for external integrations';
COMMENT ON COLUMN integration_credentials.credentials_encrypted IS 'AES-256 encrypted JSON containing API keys, tokens, etc.';
COMMENT ON COLUMN integration_credentials.integration_type IS 'Type of integration: exotel_phone, exotel_whatsapp, exotel_sms, zoho_mail';

-- ============================================================================
-- User Integration Permissions
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_integration_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  integration_id UUID NOT NULL REFERENCES integration_credentials(id) ON DELETE CASCADE,

  -- Permission levels
  can_view BOOLEAN DEFAULT false,
  can_send BOOLEAN DEFAULT false,      -- Can send emails/messages/calls
  can_configure BOOLEAN DEFAULT false, -- Can modify settings (admin only)

  -- Usage restrictions
  daily_limit INTEGER,                 -- Max operations per day
  monthly_limit INTEGER,               -- Max operations per month

  -- Audit
  granted_by UUID,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  CONSTRAINT unique_user_integration UNIQUE(user_id, integration_id)
);

COMMENT ON TABLE user_integration_permissions IS 'User-level permissions for each integration';
COMMENT ON COLUMN user_integration_permissions.can_send IS 'Permission to send messages/make calls using this integration';
COMMENT ON COLUMN user_integration_permissions.daily_limit IS 'Maximum operations per day (NULL = unlimited)';

-- ============================================================================
-- Integration Audit Logs
-- ============================================================================

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

COMMENT ON TABLE integration_audit_logs IS 'Audit trail for all integration operations';
COMMENT ON COLUMN integration_audit_logs.action IS 'Type of action performed (credential_created, email_sent, call_made, etc.)';
COMMENT ON COLUMN integration_audit_logs.details IS 'Additional context like message_id, call_duration, error messages';

-- ============================================================================
-- Organization Phone Numbers (from Exotel)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  integration_id UUID REFERENCES integration_credentials(id) ON DELETE CASCADE,

  -- Number info
  phone_number VARCHAR(20) NOT NULL,
  display_name VARCHAR(100),
  number_type VARCHAR(50),             -- 'virtual', 'toll-free', 'local'

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

  CONSTRAINT unique_org_phone_number UNIQUE(organization_id, phone_number)
);

COMMENT ON TABLE organization_phone_numbers IS 'Phone numbers from Exotel synced to organization';
COMMENT ON COLUMN organization_phone_numbers.phone_number IS 'E.164 format phone number (+91XXXXXXXXXX)';
COMMENT ON COLUMN organization_phone_numbers.assigned_to_user_id IS 'User assigned to handle calls on this number';
COMMENT ON COLUMN organization_phone_numbers.is_primary IS 'Primary outbound number for the organization';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_integration_credentials_org
  ON integration_credentials(organization_id);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_type
  ON integration_credentials(integration_type);

CREATE INDEX IF NOT EXISTS idx_integration_permissions_user
  ON user_integration_permissions(user_id);

CREATE INDEX IF NOT EXISTS idx_integration_audit_logs_org_time
  ON integration_audit_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_org
  ON organization_phone_numbers(organization_id);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_assigned
  ON organization_phone_numbers(assigned_to_user_id);

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trigger_integration_credentials_updated_at ON integration_credentials;
CREATE TRIGGER trigger_integration_credentials_updated_at
  BEFORE UPDATE ON integration_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_phone_numbers_updated_at ON organization_phone_numbers;
CREATE TRIGGER trigger_phone_numbers_updated_at
  BEFORE UPDATE ON organization_phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integration_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_phone_numbers ENABLE ROW LEVEL SECURITY;

-- Policies for integration_credentials
DROP POLICY IF EXISTS "integration_credentials_org_access" ON integration_credentials;
CREATE POLICY "integration_credentials_org_access" ON integration_credentials
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policies for user_integration_permissions
DROP POLICY IF EXISTS "user_integration_permissions_access" ON user_integration_permissions;
CREATE POLICY "user_integration_permissions_access" ON user_integration_permissions
  FOR ALL
  USING (user_id = auth.uid());

-- Policies for integration_audit_logs
DROP POLICY IF EXISTS "integration_audit_logs_org_access" ON integration_audit_logs;
CREATE POLICY "integration_audit_logs_org_access" ON integration_audit_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policies for organization_phone_numbers
DROP POLICY IF EXISTS "phone_numbers_org_access" ON organization_phone_numbers;
CREATE POLICY "phone_numbers_org_access" ON organization_phone_numbers
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Grant access to service role (for migrations)
GRANT ALL ON integration_credentials TO service_role;
GRANT ALL ON user_integration_permissions TO service_role;
GRANT ALL ON integration_audit_logs TO service_role;
GRANT ALL ON organization_phone_numbers TO service_role;

-- ============================================================================
-- Complete
-- ============================================================================
