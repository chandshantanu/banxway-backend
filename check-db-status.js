#!/usr/bin/env node

/**
 * Check database status via direct PostgreSQL connection
 */

const { Client } = require('pg');

async function checkStatus() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check schema_migrations
    console.log('📋 Checking schema_migrations table...');
    const migrationsResult = await client.query(`
      SELECT * FROM schema_migrations ORDER BY id ASC
    `);

    if (migrationsResult.rows.length > 0) {
      console.log(`✅ Found ${migrationsResult.rows.length} migration(s):\n`);
      migrationsResult.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.migration_name}`);
        console.log(`      Executed: ${new Date(row.executed_at).toLocaleString()}`);
      });
    } else {
      console.log('   No migrations found');
    }

    // Check if email functions exist
    console.log('\n📋 Checking for encryption functions...');
    const functionsResult = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('encrypt_email_password', 'decrypt_email_password')
    `);

    if (functionsResult.rows.length > 0) {
      console.log(`✅ Found ${functionsResult.rows.length} function(s):`);
      functionsResult.rows.forEach(row => {
        console.log(`   - ${row.routine_name}`);
      });
    } else {
      console.log('   ❌ No encryption functions found');
    }

    // Check email_accounts table
    console.log('\n📋 Checking email_accounts table...');
    try {
      const accountsResult = await client.query(`
        SELECT COUNT(*) as count FROM email_accounts
      `);
      console.log(`✅ email_accounts table exists with ${accountsResult.rows[0].count} account(s)`);
    } catch (err) {
      console.log('   ❌ email_accounts table does not exist');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkStatus();
