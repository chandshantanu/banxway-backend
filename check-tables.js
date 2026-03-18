#!/usr/bin/env node
/**
 * Check what tables exist in the production database
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://thaobumtmokgayljvlgn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW9idW10bW9rZ2F5bGp2bGduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIzODcwOCwiZXhwIjoyMDg0ODE0NzA4fQ.5ER68yAojIVC1Gh_IPtYwFoyDbsKFG8Qj--GeUgsXWE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTables() {
  console.log('🔍 Checking database tables...\n');

  const tablesToCheck = [
    'users',
    'customers',
    'contacts',
    'shipments',
    'communication_threads',
    'communication_messages',
    'email_accounts',
    'notifications',
    'schema_migrations'
  ];

  for (const table of tablesToCheck) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          console.log(`❌ ${table.padEnd(30)} - TABLE DOES NOT EXIST`);
        } else {
          console.log(`⚠️  ${table.padEnd(30)} - Error: ${error.message}`);
        }
      } else {
        console.log(`✅ ${table.padEnd(30)} - EXISTS (${count || 0} rows)`);
      }
    } catch (err) {
      console.log(`⚠️  ${table.padEnd(30)} - Error: ${err.message}`);
    }
  }

  console.log('\n✅ Table check complete');
}

checkTables().catch(console.error);
