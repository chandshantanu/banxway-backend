-- ========================================
-- Email Encryption RPC Permissions Fix
-- Based on: https://supabase.com/docs/guides/database/functions
-- ========================================

-- Grant USAGE on public schema to all roles
-- This allows roles to access objects in the schema
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant EXECUTE on encrypt_email_password to all roles
-- This allows roles to call the function via RPC
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO postgres;

-- Grant EXECUTE on decrypt_email_password to all roles
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO postgres;

-- Verify permissions were granted
SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('encrypt_email_password', 'decrypt_email_password')
ORDER BY routine_name, grantee;

-- Verify schema usage grants
SELECT
  schema_name,
  grantee,
  privilege_type
FROM information_schema.schema_privileges
WHERE schema_name = 'public'
ORDER BY grantee;
