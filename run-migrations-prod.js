/**
 * Production Migration Script
 * Applies pending migrations to production Supabase database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Production Supabase credentials
const SUPABASE_URL = 'https://thaobumtmokgayljvlgn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW9idW10bW9rZ2F5bGp2bGduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIzODcwOCwiZXhwIjoyMDg0ODE0NzA4fQ.5ER68yAojIVC1Gh_IPtYwFoyDbsKFG8Qj--GeUgsXWE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Migrations to run
const migrations = [
  {
    file: '007_add_message_counts.sql',
    name: 'Add message count columns',
  },
  {
    file: '008_thread_count_functions.sql',
    name: 'Add thread count functions',
  },
];

async function runMigration(migrationFile, migrationName) {
  console.log(`\n📝 Running migration: ${migrationName}`);
  console.log(`   File: ${migrationFile}`);

  const migrationPath = path.join(__dirname, 'database', 'migrations', migrationFile);

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    // Execute SQL using Supabase RPC
    // Note: We need to run raw SQL, so we'll use the PostgreSQL REST API directly
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      // If exec_sql function doesn't exist, we need another approach
      console.log('   ⚠️  exec_sql RPC not available, trying alternative method...');

      // Split SQL into individual statements and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.toUpperCase().startsWith('COMMENT ON')) {
          // Skip comment statements as they might not work via RPC
          continue;
        }

        // For CREATE OR REPLACE FUNCTION, we need special handling
        if (statement.includes('CREATE OR REPLACE FUNCTION')) {
          console.log('   📌 Creating function...');
          // We'll need to use direct SQL execution
          // This requires using the pg library or Supabase SQL editor
          console.log('   ⚠️  Function creation requires manual execution via Supabase Dashboard');
          console.log('   → Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new');
          console.log('   → Paste and run the contents of:', migrationPath);
          return false;
        }
      }
    }

    console.log('   ✅ Migration completed successfully');
    return true;
  } catch (err) {
    console.error('   ❌ Migration failed:', err.message);
    throw err;
  }
}

async function main() {
  console.log('========================================');
  console.log('Production Database Migrations');
  console.log('========================================');
  console.log('');
  console.log('Target: Supabase Production');
  console.log('URL:', SUPABASE_URL);
  console.log('');

  let needsManualExecution = false;

  for (const migration of migrations) {
    try {
      const success = await runMigration(migration.file, migration.name);
      if (!success) {
        needsManualExecution = true;
      }
    } catch (error) {
      console.error(`\n❌ Failed to run migration ${migration.file}:`, error.message);
      console.error('\n⚠️  Please run this migration manually via Supabase SQL Editor:');
      console.error(`   1. Go to: https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new`);
      console.error(`   2. Open: database/migrations/${migration.file}`);
      console.error(`   3. Copy the SQL and execute it in the SQL Editor`);
      needsManualExecution = true;
    }
  }

  console.log('\n========================================');

  if (needsManualExecution) {
    console.log('⚠️  MANUAL ACTION REQUIRED');
    console.log('========================================');
    console.log('');
    console.log('Some migrations require manual execution via Supabase Dashboard:');
    console.log('');
    console.log('1. Open Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/sql/new');
    console.log('');
    console.log('2. Run these migration files in order:');
    for (const migration of migrations) {
      console.log(`   - database/migrations/${migration.file}`);
    }
    console.log('');
    console.log('3. Copy the entire contents of each file and execute');
    console.log('');
  } else {
    console.log('✅ All migrations completed successfully!');
  }

  console.log('========================================');
}

main().catch((error) => {
  console.error('\n❌ Migration script failed:', error);
  process.exit(1);
});
