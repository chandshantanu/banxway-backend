#!/usr/bin/env node

/**
 * Comprehensive migration script
 * Runs all SQL migrations in database/migrations/ folder
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database URL from environment
const DATABASE_URL = process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL;

if (!DATABASE_URL || DATABASE_URL.includes('[password]')) {
  console.error('❌ Database URL required\n');
  console.error('Set DATABASE_URL environment variable or add to .env file\n');
  console.error('Example:');
  console.error('  DATABASE_URL="postgresql://user:password@host:port/database"\n');
  process.exit(1);
}

console.log('🚀 Database Migration Tool\n');

async function runMigrations() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Create migrations tracking table
    console.log('📋 Setting up migrations tracking...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Migration tracking ready\n');

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'database/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📂 Found ${files.length} migration files:\n`);

    for (const file of files) {
      // Check if already executed
      const checkResult = await client.query(
        'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
        [file]
      );

      if (checkResult.rows.length > 0) {
        console.log(`⏭️  Skipping ${file} (already applied)`);
        continue;
      }

      // Read and execute migration
      console.log(`\n▶️  Running ${file}...`);
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ ${file} applied successfully`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`\n❌ Failed to apply ${file}:`);
        console.error(`   ${error.message}`);
        if (error.detail) console.error(`   Details: ${error.detail}`);
        throw error;
      }
    }

    // Show applied migrations
    console.log('\n\n📊 Migration History:');
    const history = await client.query(`
      SELECT migration_name, executed_at
      FROM schema_migrations
      ORDER BY id ASC
    `);
    console.table(history.rows);

    // Verify critical tables
    console.log('\n🔍 Verifying database schema...\n');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const criticalTables = [
      'users',
      'communication_threads',
      'communication_messages',
      'email_accounts',
      'shipments'
    ];

    const existingTables = tables.rows.map(r => r.table_name);

    for (const table of criticalTables) {
      if (existingTables.includes(table)) {
        const count = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✅ ${table.padEnd(25)} (${count.rows[0].count} rows)`);
      } else {
        console.log(`⚠️  ${table.padEnd(25)} (missing)`);
      }
    }

    console.log('\n✨ All migrations completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
