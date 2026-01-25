# Database Setup for Integrations

This document describes how to set up the integration credentials tables in your Supabase database.

## Prerequisites

- Supabase project with database access
- Database admin credentials

## Setup Instructions

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy the contents of `src/database/schema/integrations.sql`
5. Execute the query

### Option 2: Using psql CLI

```bash
# Navigate to backend directory
cd banxway-backend

# Execute schema
psql "$DATABASE_URL" -f src/database/schema/integrations.sql
```

### Option 3: Using Node.js Script

```bash
cd banxway-backend
npm run db:setup-integrations
```

## Tables Created

### 1. `integration_credentials`
Stores encrypted credentials for integrations (Exotel, Zoho, etc.)

**Columns:**
- `id` - UUID primary key
- `organization_id` - Organization reference
- `integration_type` - Type: 'exotel_phone', 'exotel_whatsapp', 'zoho_mail'
- `credentials_encrypted` - AES-256 encrypted credentials
- `display_name` - User-friendly name
- `is_active` - Whether integration is enabled
- `is_verified` - Whether connection was tested successfully
- `last_verified_at` - Last successful connection test
- `created_by`, `updated_by` - Audit fields
- `created_at`, `updated_at` - Timestamps

### 2. `user_integration_permissions`
Controls which users can access specific integrations

**Columns:**
- `id` - UUID primary key
- `user_id` - User reference
- `integration_id` - Integration reference
- `can_view` - Can view integration details
- `can_send` - Can send messages/make calls
- `can_configure` - Can modify settings (admin only)
- `daily_limit`, `monthly_limit` - Usage limits
- `granted_by`, `granted_at`, `expires_at` - Audit fields

### 3. `integration_audit_logs`
Audit trail for all integration operations

**Columns:**
- `id` - UUID primary key
- `organization_id` - Organization reference
- `user_id` - User who performed action
- `integration_type` - Integration type
- `action` - Action performed (e.g., 'credential_created', 'call_made')
- `status` - 'success', 'failed', 'pending'
- `details` - JSONB with additional context
- `ip_address`, `user_agent` - Request metadata
- `created_at` - Timestamp

### 4. `organization_phone_numbers`
Phone numbers from Exotel integration

**Columns:**
- `id` - UUID primary key
- `organization_id` - Organization reference
- `integration_id` - Exotel integration reference
- `phone_number` - Phone number
- `display_name` - User-friendly name
- `number_type` - 'virtual', 'toll-free', 'local'
- `assigned_to_user_id` - Assigned user (null = pool)
- `is_primary` - Primary number for organization
- `can_call`, `can_sms` - Capabilities
- `is_active` - Whether number is active
- `created_at`, `updated_at` - Timestamps

## Environment Variables

Add to your `.env` file:

```env
# Encryption master key (required for encrypting credentials)
ENCRYPTION_MASTER_KEY=your-32-character-secret-key-here

# Or, if not set, will use Supabase service role key
# SUPABASE_SERVICE_ROLE_KEY is already in your .env
```

## Security Notes

1. **Encryption**: All credentials are encrypted using AES-256-GCM before storage
2. **Master Key**: The `ENCRYPTION_MASTER_KEY` should be:
   - At least 32 characters long
   - Randomly generated
   - Never committed to version control
   - Backed up securely
3. **RLS**: Consider enabling Row Level Security (RLS) on these tables in production
4. **Audit Logs**: All credential access and usage is logged for compliance

## Testing the Setup

After running the schema, verify tables exist:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'integration%'
  OR table_name = 'organization_phone_numbers';
```

You should see:
- `integration_credentials`
- `integration_audit_logs`
- `user_integration_permissions`
- `organization_phone_numbers`

## API Endpoints

Once setup is complete, these endpoints will be available:

- `GET /api/v1/settings/integrations` - List integrations
- `POST /api/v1/settings/integrations/:type` - Configure integration
- `POST /api/v1/settings/integrations/:type/test` - Test connection
- `DELETE /api/v1/settings/integrations/:type` - Delete integration
- `GET /api/v1/settings/phone-numbers` - List phone numbers
- `POST /api/v1/settings/phone-numbers/:id/assign` - Assign number to user

## Troubleshooting

### Error: "ENCRYPTION_MASTER_KEY not configured"
Add `ENCRYPTION_MASTER_KEY` to your `.env` file.

### Error: relation "integration_credentials" does not exist
Run the schema SQL file to create the tables.

### Error: permission denied
Ensure you're using the Supabase service role key or have admin permissions.
