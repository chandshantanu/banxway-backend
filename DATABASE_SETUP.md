# Database Setup & Migration Guide

Complete guide for setting up and managing the Banxway database schema.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Migration System](#migration-system)
3. [Running Migrations](#running-migrations)
4. [Adding New Migrations](#adding-new-migrations)
5. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Database: Supabase (PostgreSQL)

**Provider:** Supabase
**Location:** AWS ap-south-1 (Mumbai)
**Project:** thaobumtmokgayljvlgn

### Current Schema

```
Core Tables:
- users                      # User accounts and roles
- communication_threads      # Email/SMS/WhatsApp conversation threads
- communication_messages     # Individual messages
- email_accounts            # Multi-inbox email configurations
- shipments                 # Freight shipment tracking

Support Tables:
- schema_migrations         # Migration tracking
- webhook_logs             # Webhook request/response logging
```

### Security

- **Row Level Security (RLS):** Enabled on all tables
- **Roles:** admin, manager, agent, customer
- **Authentication:** Supabase Auth + JWT
- **Password Encryption:** pgcrypto for email account passwords

---

## Migration System

### How It Works

1. **Migration Files:** SQL files in `banxway-backend/database/migrations/`
2. **Naming Convention:** `NNN_description.sql` (e.g., `004_email_accounts.sql`)
3. **Tracking Table:** `schema_migrations` stores executed migrations
4. **Idempotency:** Safe to re-run; skips already-applied migrations

### Migration Runner

**File:** `banxway-backend/migrate-all.js`

**Features:**
- Automatically detects new migrations
- Runs migrations in order
- Tracks execution in `schema_migrations`
- Verifies schema after completion
- Provides detailed output

---

## Running Migrations

### Prerequisites

1. **Node.js:** v18+ or v20+ installed
2. **Database Access:** Supabase connection string
3. **Permissions:** Database admin access

### Step 1: Get Database Connection String

**Option A: From Supabase Dashboard**

1. Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/settings/database
2. Scroll to **Connection String** → **Connection Pooling**
3. Copy the URI (postgres:// format)
4. Replace `[YOUR-PASSWORD]` with your database password

**Option B: From CREDENTIALS.md (local only)**

See `CREDENTIALS.md` for the connection string template.

### Step 2: Run Migrations

```bash
cd banxway-backend

# Using environment variable
DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@xxx.pooler.supabase.com:6543/postgres" \
node migrate-all.js

# Or export first
export DATABASE_URL="postgresql://..."
node migrate-all.js
```

### Expected Output

```
🚀 Database Migration Tool

📡 Connecting to database...
✅ Connected

📋 Setting up migrations tracking...
✅ Migration tracking ready

📂 Found 4 migration files:

✅ 001_initial_schema.sql (already applied)
✅ 002_add_sms_and_transcription.sql (already applied)
✅ 003_role_based_rls_policies.sql (already applied)

▶️  Running 004_email_accounts.sql...
✅ 004_email_accounts.sql applied successfully

📊 Migration History:
┌────┬───────────────────────────────┬─────────────────────┐
│ id │ migration_name                │ executed_at         │
├────┼───────────────────────────────┼─────────────────────┤
│ 1  │ 001_initial_schema.sql        │ 2026-01-20 08:00:00 │
│ 2  │ 002_add_sms...sql             │ 2026-01-21 09:15:00 │
│ 3  │ 003_role_based_rls...sql      │ 2026-01-22 10:30:00 │
│ 4  │ 004_email_accounts.sql        │ 2026-01-25 15:45:00 │
└────┴───────────────────────────────┴─────────────────────┘

🔍 Verifying database schema...

✅ users                      (5 rows)
✅ communication_threads       (23 rows)
✅ communication_messages      (156 rows)
✅ email_accounts             (0 rows)  ← New table created
✅ shipments                  (12 rows)

✨ All migrations completed successfully!
```

### Step 3: Verify

```bash
# Test the API
curl https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/email-accounts

# Should return:
# {"success":true,"data":[],"count":0}
```

---

## Adding New Migrations

### Step 1: Create Migration File

```bash
cd banxway-backend/database/migrations

# Get next number (check existing files)
ls -la

# Create new migration
touch 005_your_feature_name.sql
```

### Step 2: Write Migration SQL

**Template:**

```sql
-- Description of what this migration does
-- Created: YYYY-MM-DD

-- =====================================================
-- SECTION 1: CREATE TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS your_table (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Add columns
  name VARCHAR(255) NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SECTION 2: INDEXES
-- =====================================================

CREATE INDEX idx_your_table_name ON your_table(name);

-- =====================================================
-- SECTION 3: TRIGGERS
-- =====================================================

CREATE TRIGGER update_your_table_updated_at
  BEFORE UPDATE ON your_table
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- SECTION 4: ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY your_table_admin_select ON your_table
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager')
    )
  );

-- =====================================================
-- SECTION 5: COMMENTS
-- =====================================================

COMMENT ON TABLE your_table IS 'Description of table purpose';
COMMENT ON COLUMN your_table.name IS 'Description of column';
```

### Step 3: Test Locally First

```bash
# Test against local Supabase
npm run migrate

# Or use Supabase CLI
supabase db reset
```

### Step 4: Apply to Production

```bash
# Run migration
DATABASE_URL="postgresql://..." node migrate-all.js

# Verify in Supabase Dashboard
# Go to Table Editor and check new tables exist
```

### Step 5: Update Backend Code

1. Create repository (if needed): `src/database/repositories/your-table.repository.ts`
2. Create service (if needed): `src/services/your-table.service.ts`
3. Create routes (if needed): `src/api/v1/routes/your-table.routes.ts`
4. Update TypeScript interfaces

### Step 6: Commit Migration

```bash
git add database/migrations/005_your_feature_name.sql
git commit -m "feat(db): add your_feature_name schema"
```

---

## Migration Best Practices

### ✅ DO:

- Use `IF NOT EXISTS` for tables and indexes
- Add proper comments for documentation
- Include RLS policies for security
- Use transactions (handled by migrate-all.js)
- Test locally before production
- Keep migrations small and focused
- Use sequential numbering

### ❌ DON'T:

- Modify existing migration files (create new ones instead)
- Include data manipulation in schema migrations
- Forget to add indexes on foreign keys
- Skip RLS policies
- Use `DROP TABLE` without IF EXISTS
- Hardcode sensitive data in migrations

---

## Troubleshooting

### Issue: "Migration already exists"

**Cause:** Migration was already run.

**Solution:** This is normal. The system skips already-applied migrations.

### Issue: "Could not find the table"

**Cause:** Migration hasn't been run yet.

**Solution:**
```bash
DATABASE_URL="your-connection-string" node migrate-all.js
```

### Issue: "Permission denied"

**Cause:** Wrong database credentials or insufficient permissions.

**Solution:**
1. Verify connection string
2. Check database password in Supabase Dashboard
3. Ensure using service_role key for admin operations

### Issue: "Connection timeout"

**Cause:** Network/firewall blocking database access.

**Solution:**
1. Check your internet connection
2. Verify Supabase project is active
3. Try connection pooler URL (port 6543) instead of direct (5432)

### Issue: "Syntax error in SQL"

**Cause:** Invalid SQL in migration file.

**Solution:**
1. Test SQL in Supabase SQL Editor first
2. Check for missing semicolons
3. Verify PostgreSQL version compatibility (use v15+ features)

### Issue: "Migration partially applied"

**Cause:** Error during migration execution.

**Solution:**
1. Check `schema_migrations` table to see what was applied
2. Manually rollback if needed
3. Fix migration file
4. Delete failed entry from `schema_migrations`
5. Re-run migration

```sql
-- Check migration status
SELECT * FROM schema_migrations ORDER BY executed_at DESC;

-- Remove failed migration (if needed)
DELETE FROM schema_migrations WHERE migration_name = '005_failed.sql';
```

---

## Current Migrations Reference

| File | Description | Date | Status |
|------|-------------|------|--------|
| `001_initial_schema.sql` | Core tables (users, threads, messages, shipments) | 2026-01-20 | ✅ Applied |
| `002_add_sms_and_transcription.sql` | SMS and call transcription support | 2026-01-21 | ✅ Applied |
| `003_role_based_rls_policies.sql` | Row-level security policies | 2026-01-22 | ✅ Applied |
| `004_email_accounts.sql` | Multi-inbox email account management | 2026-01-24 | ✅ Applied |
| `005_notifications.sql` | User notifications system with 8 notification types | 2026-01-25 | ✅ Applied |
| `006_integrations.sql` | Integration credentials storage (Exotel, Zoho) and phone numbers | 2026-01-25 | ⏳ Pending |

---

## Database Seeding

**Coming Soon:** Seed scripts for development data.

For now, create test data through the API or Supabase Dashboard.

---

## Backup & Restore

### Backup (via Supabase)

1. Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/settings/database
2. Click "Create Backup"
3. Wait for completion
4. Download backup file if needed

### Restore

1. Upload backup file in Supabase Dashboard
2. Or use pg_restore command:

```bash
pg_restore -h xxx.supabase.com -U postgres -d postgres backup.dump
```

---

## Related Documentation

- **Backend Setup:** `banxway-backend/README.md`
- **Credentials:** `CREDENTIALS.md` (gitignored, local only)
- **Backend Standards:** `banxway-backend/CLAUDE.md`
- **API Documentation:** `banxway-backend/API.md`

---

**Last Updated:** 2026-01-25
**Maintained By:** Development Team
