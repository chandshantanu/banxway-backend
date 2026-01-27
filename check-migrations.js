#!/usr/bin/env node

/**
 * Check which migrations have been run in production
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkMigrations() {
  console.log('\n🔍 Checking Migration Status\n');
  console.log('━'.repeat(70));

  // Check if schema_migrations table exists
  console.log('\n📋 Checking schema_migrations table...');

  const { data: migrations, error } = await supabase
    .from('schema_migrations')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    if (error.code === '42P01' || error.message.includes('not found')) {
      console.log('❌ schema_migrations table NOT FOUND');
      console.log('\n⚠️  DIAGNOSIS: No migrations have been run yet.');
      console.log('   SOLUTION: Run migrations:');
      console.log('   DATABASE_URL="postgresql://..." node migrate-all.js');
      return;
    }

    console.log('❌ Error:', error.message);
    return;
  }

  if (!migrations || migrations.length === 0) {
    console.log('⚠️  schema_migrations table exists but is EMPTY');
    console.log('   No migrations have been executed yet.');
    return;
  }

  console.log(`✅ Found ${migrations.length} executed migration(s):\n`);

  migrations.forEach((m, index) => {
    console.log(`   ${index + 1}. ${m.migration_name}`);
    console.log(`      Executed at: ${new Date(m.executed_at).toLocaleString()}`);
  });

  // Check for email encryption migrations
  console.log('\n📋 Checking for email encryption migrations...');

  const emailMigrations = migrations.filter(m =>
    m.migration_name.includes('email') ||
    m.migration_name.includes('encrypt') ||
    m.migration_name.includes('FIX')
  );

  if (emailMigrations.length > 0) {
    console.log(`✅ Found ${emailMigrations.length} email-related migration(s):`);
    emailMigrations.forEach(m => {
      console.log(`   - ${m.migration_name}`);
    });
  } else {
    console.log('⚠️  No email encryption migrations found');
    console.log('   Required migrations:');
    console.log('   - 004_email_accounts.sql');
    console.log('   - FIX_COMPLETE_email_accounts.sql');
  }

  // Check if email_accounts table exists
  console.log('\n📋 Checking email_accounts table...');

  const { data: accounts, error: accountsError } = await supabase
    .from('email_accounts')
    .select('id, email, smtp_host, imap_host, created_at')
    .limit(5);

  if (accountsError) {
    if (accountsError.code === '42P01' || accountsError.message.includes('not found')) {
      console.log('❌ email_accounts table NOT FOUND');
    } else {
      console.log('❌ Error:', accountsError.message);
    }
  } else {
    console.log(`✅ email_accounts table exists with ${accounts.length} account(s)`);
    if (accounts.length > 0) {
      accounts.forEach(acc => {
        console.log(`   - ${acc.email} (SMTP: ${acc.smtp_host}, IMAP: ${acc.imap_host})`);
      });
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log('\n');
}

checkMigrations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  });
