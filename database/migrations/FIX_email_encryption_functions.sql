-- =====================================================
-- FIX: Email Encryption Functions
-- =====================================================
-- This script creates the missing encryption functions
-- needed for email account password storage
--
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable pgcrypto extension (required for encryption)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encryption function for email passwords
CREATE OR REPLACE FUNCTION public.encrypt_email_password(password TEXT, key TEXT DEFAULT 'banxway_email_key_dev')
RETURNS TEXT AS $$
BEGIN
  RETURN encode(pgp_sym_encrypt(password, key), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decryption function for email passwords
CREATE OR REPLACE FUNCTION public.decrypt_email_password(encrypted TEXT, key TEXT DEFAULT 'banxway_email_key_dev')
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(decode(encrypted, 'base64'), key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO authenticated;

-- Verify functions were created
SELECT 'encrypt_email_password' as function_name,
       proname,
       prosecdef as is_security_definer
FROM pg_proc
WHERE proname = 'encrypt_email_password';

SELECT 'decrypt_email_password' as function_name,
       proname,
       prosecdef as is_security_definer
FROM pg_proc
WHERE proname = 'decrypt_email_password';
