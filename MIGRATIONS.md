# Database Migrations Guide

## Running Migrations

### Local Development (Supabase Local)

```bash
npm run migrate
```

This runs migrations against your local Supabase instance.

### Production/Azure Database

1. **Get your database connection string**:
   - For Supabase: Dashboard → Settings → Database → Connection String (Pooler)
   - Format: `postgresql://postgres.xxx:PASSWORD@xxx.pooler.supabase.com:6543/postgres`

2. **Run all migrations**:
   ```bash
   DATABASE_URL="your-connection-string" node migrate-all.js
   ```

3. **Verify migrations**:
   The script will:
   - Create a `schema_migrations` tracking table
   - Run all `.sql` files in `database/migrations/` in order
   - Skip already-applied migrations
   - Show migration history and table verification

### Example Output

```
🚀 Database Migration Tool

📡 Connecting to database...
✅ Connected

📋 Setting up migrations tracking...
✅ Migration tracking ready

📂 Found 3 migration files:

▶️  Running 002_add_sms_and_transcription.sql...
✅ 002_add_sms_and_transcription.sql applied successfully

▶️  Running 003_role_based_rls_policies.sql...
✅ 003_role_based_rls_policies.sql applied successfully

▶️  Running 004_email_accounts.sql...
✅ 004_email_accounts.sql applied successfully

📊 Migration History:
┌────┬──────────────────────────────────────┬─────────────────────┐
│ id │ migration_name                        │ executed_at         │
├────┼──────────────────────────────────────┼─────────────────────┤
│ 1  │ 002_add_sms_and_transcription.sql    │ 2026-01-25 10:30:00 │
│ 2  │ 003_role_based_rls_policies.sql      │ 2026-01-25 10:30:01 │
│ 3  │ 004_email_accounts.sql               │ 2026-01-25 10:30:02 │
└────┴──────────────────────────────────────┴─────────────────────┘

🔍 Verifying database schema...

✅ users                      (5 rows)
✅ communication_threads       (0 rows)
✅ communication_messages      (0 rows)
✅ email_accounts             (0 rows)
✅ shipments                  (0 rows)

✨ All migrations completed successfully!
```

## Current Migrations

| File | Description |
|------|-------------|
| `002_add_sms_and_transcription.sql` | Adds SMS and call transcription support |
| `003_role_based_rls_policies.sql` | Implements role-based row-level security |
| `004_email_accounts.sql` | Creates email_accounts table for multi-inbox support |

## Migration Tracking

Migrations are tracked in the `schema_migrations` table:
- Each migration runs exactly once
- Re-running is safe (skips already-applied migrations)
- Uses transactions for safety

## Troubleshooting

### "Could not find the table 'public.email_accounts'"
**Solution**: Run migrations to create missing tables:
```bash
DATABASE_URL="your-prod-db-url" node migrate-all.js
```

### "Migration already exists"
This is normal - the script skips already-applied migrations.

### Connection Errors
- Verify your database URL is correct
- Check firewall/network access to database
- Ensure SSL is enabled for production databases

## Adding New Migrations

1. Create new file: `database/migrations/005_your_migration.sql`
2. Follow numbering convention (next sequential number)
3. Include:
   - `CREATE TABLE IF NOT EXISTS` for safety
   - Proper indexes
   - Row-level security policies if needed
   - Comments for documentation

4. Test locally first:
   ```bash
   npm run migrate
   ```

5. Deploy to production:
   ```bash
   DATABASE_URL="prod-url" node migrate-all.js
   ```
