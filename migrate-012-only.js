#!/usr/bin/env node

/**
 * Run only migration 012 - Rate Management System
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Database URL from command line argument or environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL required');
  process.exit(1);
}

console.log('🚀 Running Migration 012: Rate Management System\n');

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'database/migrations/012_rate_management.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('📊 Executing SQL...\n');

    // Execute migration
    await client.query(sql);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Migration 012 completed successfully!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📦 Created:');
    console.log('   ✅ Enum types: rate_card_status, rate_type, quote_source_mode, quote_request_status');
    console.log('   ✅ shippers table (Airlines, Shipping Lines, GSAs)');
    console.log('   ✅ rate_cards table (Pre-negotiated rates - Inventory Mode)');
    console.log('   ✅ shipper_quote_requests table (On-demand quotes)');
    console.log('   ✅ Enhanced quotations table with source tracking');
    console.log('   ✅ Views: active_rate_cards, pending_shipper_quotes');
    console.log('   ✅ Functions: calculate_freight_cost(), auto-number generators');
    console.log('   ✅ Triggers: Auto-update timestamps');
    console.log('   ✅ Sample data: 3 shippers, 1 rate card (Mumbai → Dubai)\n');
    console.log('🔍 Verify with:');
    console.log('   SELECT * FROM shippers;');
    console.log('   SELECT * FROM active_rate_cards;');
    console.log('   SELECT * FROM rate_cards;');

    // Record in migration tracking
    await client.query(`
      INSERT INTO schema_migrations (migration_name)
      VALUES ('012_rate_management.sql')
      ON CONFLICT (migration_name) DO NOTHING
    `);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
