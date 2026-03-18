/**
 * Database Configuration
 *
 * - `db` / `supabaseAdmin`: PostgreSQL direct connection via pg Pool (for ALL data queries)
 * - `supabase`: Supabase client (for AUTH ONLY — token verification, user management)
 *
 * The `supabaseAdmin` export is a backward-compatible alias for `db` so existing
 * imports continue to work without changes across 50+ files.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { db } from './pg-client';

dotenv.config();

// Validate required env vars
if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL not set — database queries will fail');
}

// Supabase client — AUTH ONLY (token verification, user management)
// These env vars are optional if not using Supabase auth
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

export const supabase = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: true, persistSession: false },
    })
  : null;

export const supabaseAuth = supabaseUrl
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// supabaseAdmin is now a PostgreSQL direct client (drop-in replacement)
// All .from().select().eq().single() patterns work identically
export const supabaseAdmin = db;

export { db };
export default supabase;
