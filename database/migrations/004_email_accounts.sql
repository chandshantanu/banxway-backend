-- Email Accounts Migration
-- Adds support for multiple configurable email inboxes

-- =====================================================
-- EMAIL ACCOUNTS TABLE
-- =====================================================
-- Stores configuration for multiple email accounts (inboxes)
-- Each account can be used for sending and/or receiving emails

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Account identification
  name VARCHAR(255) NOT NULL,               -- Display name (e.g., "Sales Inbox", "Support Inbox")
  email VARCHAR(255) UNIQUE NOT NULL,       -- Email address

  -- SMTP Configuration (for sending)
  smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.zoho.com',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_pass_encrypted TEXT NOT NULL,        -- Encrypted password (use pgcrypto)
  smtp_secure BOOLEAN DEFAULT FALSE,        -- Use TLS
  smtp_enabled BOOLEAN DEFAULT TRUE,        -- Can this account send emails?

  -- IMAP Configuration (for receiving)
  imap_host VARCHAR(255) NOT NULL DEFAULT 'imap.zoho.com',
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_user VARCHAR(255) NOT NULL,
  imap_pass_encrypted TEXT NOT NULL,        -- Encrypted password
  imap_tls BOOLEAN DEFAULT TRUE,
  imap_enabled BOOLEAN DEFAULT TRUE,        -- Should we poll this inbox?

  -- Polling configuration
  poll_interval_ms INTEGER DEFAULT 30000,   -- How often to poll (30 seconds default)
  last_polled_at TIMESTAMPTZ,               -- When was this inbox last polled
  last_poll_status VARCHAR(50),             -- SUCCESS, FAILED, etc.
  last_poll_error TEXT,                     -- Error message if last poll failed

  -- Email signature
  signature_html TEXT,                      -- HTML signature for outbound emails
  signature_text TEXT,                      -- Plain text signature

  -- Account settings
  is_default BOOLEAN DEFAULT FALSE,         -- Is this the default sending account?
  is_active BOOLEAN DEFAULT TRUE,           -- Is this account active?
  auto_assign_to UUID REFERENCES users(id), -- Auto-assign new threads from this inbox
  default_tags TEXT[] DEFAULT ARRAY[]::TEXT[], -- Tags to apply to threads from this inbox

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_accounts_email ON email_accounts(email);
CREATE INDEX idx_email_accounts_active ON email_accounts(is_active);
CREATE INDEX idx_email_accounts_default ON email_accounts(is_default) WHERE is_default = TRUE;

-- Only one default account allowed
CREATE UNIQUE INDEX idx_email_accounts_single_default ON email_accounts(is_default) WHERE is_default = TRUE;

-- Update trigger
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins and managers can manage email accounts
CREATE POLICY email_accounts_admin_select ON email_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager')
    )
  );

CREATE POLICY email_accounts_admin_insert ON email_accounts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY email_accounts_admin_update ON email_accounts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY email_accounts_admin_delete ON email_accounts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- =====================================================
-- ADD EMAIL ACCOUNT REFERENCE TO MESSAGES
-- =====================================================
-- Track which account a message was sent from or received to

ALTER TABLE communication_messages
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id);

CREATE INDEX IF NOT EXISTS idx_messages_email_account ON communication_messages(email_account_id);

-- =====================================================
-- ADD EMAIL ACCOUNT REFERENCE TO THREADS
-- =====================================================
-- Track which account is primarily associated with a thread

ALTER TABLE communication_threads
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id);

CREATE INDEX IF NOT EXISTS idx_threads_email_account ON communication_threads(email_account_id);

-- =====================================================
-- HELPER FUNCTION: Encrypt password
-- =====================================================
-- Note: In production, use a proper secrets manager (AWS KMS, HashiCorp Vault)
-- This is a simple encryption using pgcrypto for development

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION encrypt_email_password(password TEXT, key TEXT DEFAULT 'banxway_email_key_dev')
RETURNS TEXT AS $$
BEGIN
  RETURN encode(pgp_sym_encrypt(password, key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_email_password(encrypted TEXT, key TEXT DEFAULT 'banxway_email_key_dev')
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(encrypted, 'base64'), key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE email_accounts IS 'Configurable email accounts for multi-inbox support';
COMMENT ON COLUMN email_accounts.smtp_pass_encrypted IS 'Encrypted SMTP password - use encrypt_email_password() to set';
COMMENT ON COLUMN email_accounts.imap_pass_encrypted IS 'Encrypted IMAP password - use encrypt_email_password() to set';
