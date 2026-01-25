-- =====================================================
-- COMPLETE FIX: Email Accounts System
-- =====================================================
-- This combines migration 004 with corrected encryption functions
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- STEP 1: Create email_accounts table
-- =====================================================

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Account identification
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,

  -- SMTP Configuration (for sending)
  smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.zoho.com',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_pass_encrypted TEXT NOT NULL,
  smtp_secure BOOLEAN DEFAULT FALSE,
  smtp_enabled BOOLEAN DEFAULT TRUE,

  -- IMAP Configuration (for receiving)
  imap_host VARCHAR(255) NOT NULL DEFAULT 'imap.zoho.com',
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_user VARCHAR(255) NOT NULL,
  imap_pass_encrypted TEXT NOT NULL,
  imap_tls BOOLEAN DEFAULT TRUE,
  imap_enabled BOOLEAN DEFAULT TRUE,

  -- Polling configuration
  poll_interval_ms INTEGER DEFAULT 30000,
  last_polled_at TIMESTAMPTZ,
  last_poll_status VARCHAR(50),
  last_poll_error TEXT,

  -- Email signature
  signature_html TEXT,
  signature_text TEXT,

  -- Account settings
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  auto_assign_to UUID REFERENCES users(id),
  default_tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 2: Create indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_email_accounts_active ON email_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_email_accounts_default ON email_accounts(is_default) WHERE is_default = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_single_default ON email_accounts(is_default) WHERE is_default = TRUE;

-- =====================================================
-- STEP 3: Add email_account_id to communication tables
-- =====================================================

ALTER TABLE communication_messages
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id);

CREATE INDEX IF NOT EXISTS idx_messages_email_account ON communication_messages(email_account_id);

ALTER TABLE communication_threads
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id);

CREATE INDEX IF NOT EXISTS idx_threads_email_account ON communication_threads(email_account_id);

-- =====================================================
-- STEP 4: Create updated_at trigger
-- =====================================================

-- First, ensure the trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for email_accounts
DROP TRIGGER IF EXISTS update_email_accounts_updated_at ON email_accounts;
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- STEP 5: Enable Row Level Security
-- =====================================================

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS email_accounts_admin_select ON email_accounts;
DROP POLICY IF EXISTS email_accounts_admin_insert ON email_accounts;
DROP POLICY IF EXISTS email_accounts_admin_update ON email_accounts;
DROP POLICY IF EXISTS email_accounts_admin_delete ON email_accounts;

-- Create RLS policies (admin and manager access)
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
-- STEP 6: Create encryption functions (CORRECTED VERSION)
-- =====================================================
-- IMPORTANT: These use single-parameter signature for Supabase RPC

-- Drop any existing versions
DROP FUNCTION IF EXISTS public.encrypt_email_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.encrypt_email_password(TEXT);
DROP FUNCTION IF EXISTS public.decrypt_email_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.decrypt_email_password(TEXT);

-- Encryption function (Supabase RPC compatible)
CREATE OR REPLACE FUNCTION public.encrypt_email_password(password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encryption_key TEXT := 'banxway_email_key_prod_2024';
BEGIN
  RETURN encode(pgp_sym_encrypt(password, encryption_key), 'base64');
END;
$$;

-- Decryption function (Supabase RPC compatible)
CREATE OR REPLACE FUNCTION public.decrypt_email_password(encrypted TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encryption_key TEXT := 'banxway_email_key_prod_2024';
BEGIN
  RETURN pgp_sym_decrypt(decode(encrypted, 'base64'), encryption_key);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO anon;

-- =====================================================
-- STEP 7: Add comments
-- =====================================================

COMMENT ON TABLE email_accounts IS 'Configurable email accounts for multi-inbox support';
COMMENT ON COLUMN email_accounts.smtp_pass_encrypted IS 'Encrypted SMTP password - use encrypt_email_password() to set';
COMMENT ON COLUMN email_accounts.imap_pass_encrypted IS 'Encrypted IMAP password - use encrypt_email_password() to set';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify table was created
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'email_accounts';

-- Verify columns exist
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'email_accounts'
ORDER BY ordinal_position;

-- Verify encryption functions exist
SELECT
  proname as function_name,
  prosecdef as is_security_definer,
  pronargs as num_args
FROM pg_proc
WHERE proname IN ('encrypt_email_password', 'decrypt_email_password')
  AND pronamespace = 'public'::regnamespace;

-- Test encryption/decryption
SELECT
  'Encryption test' as test,
  encrypt_email_password('test_password_123') as encrypted;

SELECT
  'Decryption test' as test,
  decrypt_email_password(encrypt_email_password('test_password_123')) as decrypted;

-- =====================================================
-- DONE!
-- =====================================================
-- You should see:
-- 1. Table 'email_accounts' created
-- 2. All columns listed
-- 3. Two encryption functions (each with 1 argument)
-- 4. Successful encryption/decryption test
-- =====================================================
