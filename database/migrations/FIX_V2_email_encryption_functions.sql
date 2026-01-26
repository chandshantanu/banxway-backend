-- =====================================================
-- FIX V2: Email Encryption Functions (Supabase RPC Compatible)
-- =====================================================
-- This version is compatible with Supabase RPC calls
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable pgcrypto extension (required for encryption)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing functions if they exist (to avoid conflicts)
DROP FUNCTION IF EXISTS public.encrypt_email_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.encrypt_email_password(TEXT);
DROP FUNCTION IF EXISTS public.decrypt_email_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.decrypt_email_password(TEXT);

-- Encryption function for email passwords
-- This signature works with Supabase RPC: supabase.rpc('encrypt_email_password', { password: 'xxx' })
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

-- Decryption function for email passwords
-- This signature works with Supabase RPC: supabase.rpc('decrypt_email_password', { encrypted: 'xxx' })
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO anon;

-- Verify functions were created
SELECT
  routine_name as function_name,
  routine_schema as schema,
  data_type as return_type,
  routine_definition as definition_preview
FROM information_schema.routines
WHERE routine_name IN ('encrypt_email_password', 'decrypt_email_password')
  AND routine_schema = 'public';

-- Test the functions
SELECT
  'encrypt_email_password' as test_function,
  encrypt_email_password('test_password_123') as encrypted_result;

SELECT
  'decrypt_email_password' as test_function,
  decrypt_email_password(encrypt_email_password('test_password_123')) as decrypted_result;
