#!/usr/bin/env node

/**
 * Simple migration script to apply user trigger
 * Uses raw SQL execution via pg client
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Check if we have database URL
const DATABASE_URL = process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres.thaobumtmokgayljvlgn:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

console.log('🚀 Applying user trigger migration...\n');

async function runMigration() {
  // Parse connection string to check if we have a password
  if (DATABASE_URL.includes('[password]')) {
    console.error('❌ Database password required\n');
    console.error('You need the database password from Supabase Dashboard:');
    console.error('  https://supabase.com/dashboard/project/thaobumtmokgayljvlgn/settings/database\n');
    console.error('Then run:');
    console.error('  DATABASE_URL="postgresql://postgres.thaobumtmokgayljvlgn:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" node migrate.js\n');
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'src/database/migrations/002_create_user_trigger.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Running migration:', migrationPath, '\n');

    // Execute the migration
    await client.query(sql);

    console.log('✅ Migration applied successfully!\n');

    // Verify users table
    console.log('🔍 Checking users table...\n');
    const result = await client.query(`
      SELECT COUNT(*) as count FROM public.users;
    `);
    console.log('📊 Total users in public.users:', result.rows[0].count);

    // Show sample users
    const sample = await client.query(`
      SELECT id, email, role, is_active
      FROM public.users
      LIMIT 5;
    `);
    console.log('\n📋 Sample users:');
    console.table(sample.rows);

    console.log('\n✨ All done! Authentication should now work properly.\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.detail) console.error('Details:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
