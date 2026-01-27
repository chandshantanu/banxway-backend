-- Fix permissions for encryption functions to be callable via Supabase RPC
-- This grants execute permissions to authenticated and service_role

-- Grant execute on encrypt_email_password
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO anon;

-- Grant execute on decrypt_email_password
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO anon;

-- Verify grants were applied
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('encrypt_email_password', 'decrypt_email_password')
ORDER BY routine_name, grantee;
