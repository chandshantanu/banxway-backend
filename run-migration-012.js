const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚀 Running Migration 012: Rate Management System');
  console.log('');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'database/migrations/012_rate_management.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('📊 Executing SQL...');
    console.log('');

    // Split into statements and execute one by one
    // This is more reliable than using exec_sql RPC
    const pg = require('pg');
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL || `${supabaseUrl.replace('https://', 'postgresql://postgres:')}@db.${supabaseUrl.split('//')[1].split('.')[0]}.supabase.co:5432/postgres`
    });

    await client.connect();

    console.log('✅ Connected to database');
    console.log('');

    // Execute the entire migration
    await client.query(sql);

    await client.end();

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Created:');
    console.log('  - Enum types: rate_card_status, rate_type, quote_source_mode, quote_request_status');
    console.log('  - shippers table (Airlines, Shipping Lines, GSAs)');
    console.log('  - rate_cards table (Pre-negotiated rates - Inventory Mode)');
    console.log('  - shipper_quote_requests table (On-demand quotes)');
    console.log('  - Enhanced quotations table with source tracking');
    console.log('  - Views: active_rate_cards, pending_shipper_quotes');
    console.log('  - Functions: calculate_freight_cost(), generate_rate_card_number(), generate_quote_request_number()');
    console.log('  - Triggers: Auto-update timestamps');
    console.log('  - Sample data: 3 shippers, 1 rate card (Mumbai → Dubai)');
    console.log('');
    console.log('📊 Verify with:');
    console.log('   SELECT * FROM shippers;');
    console.log('   SELECT * FROM active_rate_cards;');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('');
    console.error('Full error:', err);
    process.exit(1);
  }
}

runMigration();
