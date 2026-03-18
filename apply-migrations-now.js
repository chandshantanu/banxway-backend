/**
 * Apply Production Migrations
 * Executes SQL migrations directly against Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Production credentials
const SUPABASE_URL = 'https://thaobumtmokgayljvlgn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW9idW10bW9rZ2F5bGp2bGduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIzODcwOCwiZXhwIjoyMDg0ODE0NzA4fQ.5ER68yAojIVC1Gh_IPtYwFoyDbsKFG8Qj--GeUgsXWE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeSql(sql) {
  // Use Supabase's REST API to execute SQL
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SQL execution failed: ${error}`);
  }

  return await response.json();
}

async function runMigration(fileName, description) {
  console.log(`\n📝 ${description}`);
  console.log(`   File: ${fileName}`);

  const filePath = path.join(__dirname, 'database', 'migrations', fileName);
  const sql = fs.readFileSync(filePath, 'utf8');

  try {
    // For PostgreSQL functions and complex SQL, we need to use a different approach
    // We'll use the pg library to connect directly
    const { Pool } = require('pg');

    // Try to get connection string from environment or construct it
    const connectionString = process.env.DATABASE_URL ||
      `postgresql://postgres.thaobumtmokgayljvlgn@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

    console.log('   ⚠️  Direct SQL execution requires database password');
    console.log('   ℹ️  Using Supabase REST API instead...');

    // Alternative: Try using Supabase's SQL execution
    // Note: This requires a custom RPC function or direct database access

    console.log('   📌 SQL to execute:');
    console.log('   ' + '-'.repeat(60));
    console.log(sql.split('\n').map(line => `   ${line}`).join('\n'));
    console.log('   ' + '-'.repeat(60));

    console.log('\n   ⚠️  Manual execution required via Supabase Dashboard');
    console.log('   → https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new');

    return false;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('Apply Production Database Migrations');
  console.log('========================================\n');
  console.log('Target: Supabase Production');
  console.log('URL:', SUPABASE_URL);
  console.log('');

  const migrations = [
    {
      file: '007_add_message_counts.sql',
      desc: 'Add message count columns to threads table'
    },
    {
      file: '008_thread_count_functions.sql',
      desc: 'Create atomic counter functions'
    }
  ];

  console.log('⚠️  IMPORTANT: These migrations require database admin privileges');
  console.log('The recommended approach is to use Supabase SQL Editor:');
  console.log('');
  console.log('1. Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new');
  console.log('2. Copy and paste the SQL from each migration file');
  console.log('3. Click "Run" to execute');
  console.log('');
  console.log('Migrations to apply:');

  for (const migration of migrations) {
    console.log(`   - ${migration.file}: ${migration.desc}`);
  }

  console.log('\n========================================\n');
  console.log('📋 SQL Preview:\n');

  for (const migration of migrations) {
    await runMigration(migration.file, migration.desc);
  }

  console.log('\n========================================');
  console.log('✅ Next Steps:');
  console.log('========================================\n');
  console.log('1. Copy the SQL shown above');
  console.log('2. Open Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new');
  console.log('3. Paste and execute each migration');
  console.log('4. Verify with:');
  console.log('');
  console.log('   SELECT column_name FROM information_schema.columns');
  console.log('   WHERE table_name = \'communication_threads\'');
  console.log('   AND column_name IN (\'message_count\', \'unread_count\');');
  console.log('');
  console.log('   SELECT routine_name FROM information_schema.routines');
  console.log('   WHERE routine_name LIKE \'%thread%count%\';');
  console.log('');
  console.log('========================================\n');
}

main().catch(console.error);
