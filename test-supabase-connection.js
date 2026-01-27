#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testConnection() {
  console.log('\n🔍 Testing Supabase Connection\n');
  console.log('URL:', SUPABASE_URL);
  console.log('Key:', SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Test 1: Simple table query
  console.log('📋 Test 1: Querying email_accounts table...');
  const { data: accounts, error: accountsError } = await supabase
    .from('email_accounts')
    .select('id, email')
    .limit(1);

  if (accountsError) {
    console.log('❌ Table query failed:', accountsError.message);
  } else {
    console.log('✅ Table query SUCCESS');
    console.log('   Found:', accounts?.length || 0, 'accounts');
  }

  // Test 2: RPC call
  console.log('\n📋 Test 2: Testing RPC call...');
  const { data: encryptData, error: encryptError } = await supabase.rpc('encrypt_email_password', {
    password: 'TestPassword123'
  });

  if (encryptError) {
    console.log('❌ RPC failed:', encryptError.message);
    console.log('   Error details:', JSON.stringify(encryptError, null, 2));
  } else {
    console.log('✅ RPC SUCCESS');
    console.log('   Result:', encryptData);
  }
}

testConnection();
