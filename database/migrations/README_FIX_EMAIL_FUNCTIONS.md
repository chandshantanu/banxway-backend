# Fix Email Encryption Functions - Quick Guide

## Problem
Error: `Could not find the function public.encrypt_email_password(password) in the schema cache`

This happens when trying to create email accounts because the encryption functions from migration 004 were never applied to the production database.

## Solution - Run SQL in Supabase

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard/project/thaobumtmokgayljvlgn
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Copy and Run This SQL

```sql
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO authenticated;
```

### Step 3: Verify Functions Were Created

Run this query to verify:

```sql
SELECT proname, prosecdef as is_security_definer
FROM pg_proc
WHERE proname IN ('encrypt_email_password', 'decrypt_email_password');
```

You should see 2 rows returned.

### Step 4: Test Email Account Creation

Go back to the Banxway app and try creating an email account again. The error should be gone!

## Alternative: Run Full Migration 004

If you want to run the complete migration 004 (which also creates the email_accounts table if missing):

### Option A: Using Supabase Dashboard
1. Open SQL Editor
2. Copy the entire contents of `004_email_accounts.sql`
3. Paste and run in SQL Editor

### Option B: Using Migration Script
```bash
cd banxway-backend
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.thaobumtmokgayljvlgn.supabase.co:5432/postgres" node run-migration.js 004
```

## What This Fixes

- ✅ Email account creation will work
- ✅ Password encryption/decryption for SMTP and IMAP
- ✅ Secure storage of email credentials

## Files
- Fix SQL: `FIX_email_encryption_functions.sql`
- Full Migration: `004_email_accounts.sql`
