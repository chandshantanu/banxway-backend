# Quick Migration Queries

If you prefer to run migrations manually via Supabase Dashboard SQL Editor instead of using the migration runner, copy and paste these queries.

---

## Option 1: Use Migration Runner (Recommended)

```bash
cd banxway-backend

# Get your database connection string from:
# https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/settings/database
# Copy "Connection string" under "Connection pooling"

DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
node migrate-all.js
```

This will:
- Run all pending migrations
- Track which migrations have been applied
- Skip already-applied migrations
- Provide detailed output and verification

---

## Option 2: Manual SQL Execution

If you need to run migrations manually in Supabase Dashboard:

### Step 1: Go to SQL Editor

https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new

### Step 2: Copy Migration SQL

**For email_accounts table (004_email_accounts.sql):**

See the complete SQL in: `database/migrations/004_email_accounts.sql`

Or run this simplified version:

```sql
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create email_accounts table
CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,

  -- SMTP Configuration
  smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp.zoho.com',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_pass_encrypted TEXT NOT NULL,
  smtp_secure BOOLEAN DEFAULT FALSE,
  smtp_enabled BOOLEAN DEFAULT TRUE,

  -- IMAP Configuration
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_email_accounts_active ON email_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_email_accounts_default ON email_accounts(is_default) WHERE is_default = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_single_default ON email_accounts(is_default) WHERE is_default = TRUE;

-- Update trigger
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON email_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY email_accounts_admin_select ON email_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager')
    )
  );

CREATE POLICY email_accounts_admin_insert ON email_accounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY email_accounts_admin_update ON email_accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY email_accounts_admin_delete ON email_accounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add email account reference to messages
ALTER TABLE communication_messages
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id);

CREATE INDEX IF NOT EXISTS idx_messages_email_account ON communication_messages(email_account_id);

-- Add email account reference to threads
ALTER TABLE communication_threads
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id);

CREATE INDEX IF NOT EXISTS idx_threads_email_account ON communication_threads(email_account_id);

-- Encryption functions
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

-- Add to migration tracking
INSERT INTO schema_migrations (migration_name)
VALUES ('004_email_accounts.sql')
ON CONFLICT (migration_name) DO NOTHING;
```

### Step 3: Execute

1. Paste the SQL into the editor
2. Click "Run" or press Cmd+Enter (Mac) / Ctrl+Enter (Windows)
3. Wait for success message
4. Verify table was created in Table Editor

---

## Verification

After running migration, verify it worked:

```sql
-- Check if table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'email_accounts';

-- Check migration was tracked
SELECT * FROM schema_migrations
WHERE migration_name = '004_email_accounts.sql';

-- Check table structure
\d email_accounts
```

Or test via API:

```bash
curl https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/email-accounts

# Should return:
# {"success":true,"data":[],"count":0}
```

---

## Troubleshooting

### Error: "relation 'users' does not exist"

You need to run earlier migrations first. Run migrations in order:
1. `001_initial_schema.sql`
2. `002_add_sms_and_transcription.sql`
3. `003_role_based_rls_policies.sql`
4. `004_email_accounts.sql`

### Error: "function update_updated_at() does not exist"

This function should be created in `001_initial_schema.sql`. Create it manually:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Error: "permission denied"

Make sure you're logged in as admin in Supabase Dashboard.

---

## Adding Your First Email Account

Once the table is created, add an account via API:

```bash
curl -X POST \
  https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/settings/email-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Support Inbox",
    "email": "support@yourdomain.com",
    "smtp_user": "support@yourdomain.com",
    "smtp_password": "your-password",
    "smtp_host": "smtp.zoho.com",
    "smtp_port": 587,
    "imap_user": "support@yourdomain.com",
    "imap_password": "your-password",
    "imap_host": "imap.zoho.com",
    "imap_port": 993,
    "is_default": true
  }'
```

Or use the frontend settings page once it's built.

---

**For more details, see:**
- `DATABASE_SETUP.md` - Complete migration guide
- `database/migrations/004_email_accounts.sql` - Full SQL
- `README_STANDARDS.md` - Project standards overview
