# Fix Email Accounts System - Complete Guide

## Problem
Two related errors when trying to create email accounts:
1. `Could not find the table 'public.email_accounts' in the schema cache`
2. `Could not find the function public.encrypt_email_password(password) in the schema cache`

This happens because migration 004 was never applied to the production database.

## Solution - Run COMPLETE Fix SQL in Supabase (RECOMMENDED)

### Option A: Run Complete Fix (RECOMMENDED)

This single SQL file creates everything you need:
- `email_accounts` table
- Encryption functions with correct signature
- RLS policies
- Indexes

**Steps:**
1. Go to https://supabase.com/dashboard/project/thaobumtmokgayljvlgn
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the **entire contents** of `FIX_COMPLETE_email_accounts.sql`
5. Paste and click **Run**
6. Verify all verification queries pass at the bottom

**File:** `FIX_COMPLETE_email_accounts.sql`

---

### Option B: Run Only Encryption Functions (If table already exists)

If you already have the `email_accounts` table but just need the encryption functions:

**Steps:**
1. Open Supabase SQL Editor
2. Copy and run the SQL below

**IMPORTANT:** This version is compatible with Supabase RPC calls.

```sql
-- Enable pgcrypto extension (required for encryption)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing functions if any (cleanup)
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
