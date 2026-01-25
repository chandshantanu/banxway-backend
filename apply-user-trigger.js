#!/usr/bin/env node

/**
 * Apply user trigger migration to production Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Production Supabase credentials
const SUPABASE_URL = 'https://thaobumtmokgayljvlgn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('');
  console.error('Get it from: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/settings/api');
  console.error('');
  console.error('Then run:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="your-key-here" node apply-user-trigger.js');
  process.exit(1);
}

async function applyMigration() {
  console.log('🚀 Applying user trigger migration to production...\n');

  // Create Supabase client with service role key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Read migration file
  const migrationPath = path.join(__dirname, 'src/database/migrations/002_create_user_trigger.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file:', migrationPath);
  console.log('📊 SQL length:', sql.length, 'characters\n');

  try {
    // Execute each statement separately
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log('📝 Executing', statements.length, 'SQL statements...\n');

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comments
      if (statement.trim().startsWith('--')) continue;

      console.log(`[${i + 1}/${statements.length}] Executing...`);

      const { data, error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        // Try alternative approach using REST API
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ sql: statement }),
        });

        if (!response.ok) {
          console.error('❌ Error executing statement:', statement.substring(0, 100) + '...');
          console.error('Error:', error || await response.text());

          // For some errors, we can continue
          if (statement.includes('DROP TRIGGER IF EXISTS')) {
            console.log('⚠️  Continuing (trigger may not exist yet)...\n');
            continue;
          }

          throw new Error('Failed to execute SQL');
        }
      }

      console.log('✅ Success\n');
    }

    console.log('✅ Migration applied successfully!\n');

    // Verify by checking if users were backfilled
    console.log('🔍 Verifying users...\n');

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, role, is_active')
      .limit(5);

    if (usersError) {
      console.error('⚠️  Could not verify users:', usersError.message);
    } else {
      console.log('📊 Sample users from public.users table:');
      console.table(users);
    }

    console.log('\n✨ All done! Users can now authenticate properly.\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
