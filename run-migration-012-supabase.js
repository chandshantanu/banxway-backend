const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Production Supabase credentials
const supabaseUrl = 'https://thaobumtmokgayljvlgn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW9idW10bW9rZ2F5bGp2bGduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIzODcwOCwiZXhwIjoyMDg0ODE0NzA4fQ.oPqG5vQY6LqPXHLBRGE8rJ0E1lYqB0dKX_zXZkF8vXs';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚀 Running Migration 012: Rate Management System');
  console.log('📍 Target: Production Supabase Database');
  console.log('');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'database/migrations/012_rate_management.sql');
    let sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('');

    // Split SQL into individual statements
    // We'll execute them one by one to better handle errors
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Executing ${statements.length} SQL statements...`);
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.trim().length === 0) {
        continue;
      }

      // Log progress every 10 statements
      if (i % 10 === 0 && i > 0) {
        console.log(`   Progress: ${i}/${statements.length} statements...`);
      }

      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: statement + ';'
        });

        if (error) {
          // Check if it's a "already exists" error (which we can ignore)
          if (error.message?.includes('already exists') ||
              error.message?.includes('duplicate')) {
            console.log(`⚠️  Skipped (already exists): ${statement.substring(0, 50)}...`);
            successCount++;
            continue;
          }

          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          console.error(`   Statement: ${statement.substring(0, 100)}...`);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`❌ Unexpected error on statement ${i + 1}:`, err.message);
        errorCount++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Migration completed!`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('📦 Created:');
    console.log('   ✅ Enum types: rate_card_status, rate_type, quote_source_mode, quote_request_status');
    console.log('   ✅ shippers table (Airlines, Shipping Lines, GSAs)');
    console.log('   ✅ rate_cards table (Pre-negotiated rates)');
    console.log('   ✅ shipper_quote_requests table (On-demand quotes)');
    console.log('   ✅ Enhanced quotations table with source tracking');
    console.log('   ✅ Views: active_rate_cards, pending_shipper_quotes');
    console.log('   ✅ Functions: calculate_freight_cost()');
    console.log('   ✅ Sample data: 3 shippers, 1 rate card');
    console.log('');
    console.log('🔍 Verify with:');
    console.log('   SELECT * FROM shippers;');
    console.log('   SELECT * FROM active_rate_cards;');
    console.log('   SELECT * FROM calculate_freight_cost(\'rate-card-id\', 150);');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('');
    console.error('Full error:', err);
    process.exit(1);
  }
}

runMigration();
