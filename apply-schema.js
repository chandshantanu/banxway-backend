/**
 * Quick script to apply integration database schema
 * Run with: node apply-schema.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applySchema() {
  console.log('🚀 Starting database schema application...\n');

  // Create Supabase admin client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'src', 'database', 'schema', 'integrations.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Schema file loaded\n');

    // Split into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement using Supabase RPC
    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const preview = statement.substring(0, 80).replace(/\n/g, ' ');

      process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);

      try {
        // Execute using raw SQL via pg connection
        const { error } = await supabase.rpc('exec_sql', { query: statement });

        if (error) {
          // RPC might not exist, that's okay - continue
          console.log('⚠️  (will execute manually)');
          skipCount++;
        } else {
          console.log('✅');
          successCount++;
        }
      } catch (err) {
        console.log('⚠️  (will execute manually)');
        skipCount++;
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   ✅ Executed: ${successCount}`);
    console.log(`   ⚠️  Skipped: ${skipCount}`);

    if (skipCount > 0) {
      console.log('\n⚠️  Some statements need manual execution.');
      console.log('   Please run the SQL in Supabase Dashboard:');
      console.log('   1. Go to: http://127.0.0.1:54421/project/default/sql');
      console.log('   2. Copy contents of: src/database/schema/integrations.sql');
      console.log('   3. Click "Run"\n');
    }

    // Verify tables
    console.log('\n🔍 Verifying tables...\n');

    const tables = [
      'integration_credentials',
      'user_integration_permissions',
      'integration_audit_logs',
      'organization_phone_numbers',
    ];

    let verifiedCount = 0;

    for (const table of tables) {
      process.stdout.write(`   Checking ${table}... `);
      const { error } = await supabase.from(table).select('id').limit(0);

      if (error) {
        console.log('❌ Not found');
      } else {
        console.log('✅ Exists');
        verifiedCount++;
      }
    }

    console.log(`\n   ${verifiedCount}/${tables.length} tables verified\n`);

    if (verifiedCount === tables.length) {
      console.log('✅ Database schema applied successfully!\n');
      console.log('Next steps:');
      console.log('1. Ensure ENCRYPTION_MASTER_KEY is in .env');
      console.log('2. Restart backend: npm run dev');
      console.log('3. Test at: http://localhost:8000/api/v1/settings/integrations\n');
    } else {
      console.log('⚠️  Please apply the schema manually (see instructions above)\n');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nPlease apply the schema manually:');
    console.error('1. Go to: http://127.0.0.1:54421/project/default/sql');
    console.error('2. Copy: src/database/schema/integrations.sql');
    console.error('3. Execute the SQL\n');
    process.exit(1);
  }
}

applySchema();
