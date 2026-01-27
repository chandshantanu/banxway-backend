#!/usr/bin/env node

/**
 * Email Password Encryption/Decryption Test Script
 *
 * This script tests the PostgreSQL encryption functions to diagnose
 * why email authentication to Zoho Mail is failing.
 *
 * Usage:
 *   node test-encryption.js
 *
 * Requirements:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or environment
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nMake sure these are set in your .env file or environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testEncryptionFunctions() {
  console.log('\n🔍 Testing Email Password Encryption/Decryption\n');
  console.log('━'.repeat(60));

  // Test 1: Check if functions exist by trying to use them
  console.log('\n📋 Test 1: Checking if encryption functions exist...');

  // Test 2: Test encryption
  console.log('\n📋 Test 2: Testing password encryption...');

  const testPassword = 'TestPassword123!';
  console.log(`   Input: "${testPassword}"`);

  const { data: encrypted, error: encryptError } = await supabase.rpc('encrypt_email_password', {
    password: testPassword
  });

  if (encryptError) {
    console.log('❌ Encryption FAILED');
    console.log('   Error:', encryptError.message);
    console.log('\n⚠️  DIAGNOSIS: The encryption function exists but cannot encrypt.');
    console.log('   POSSIBLE CAUSES:');
    console.log('   - pgcrypto extension not installed');
    console.log('   - Function signature mismatch');
    console.log('   SOLUTION: Run the latest FIX_COMPLETE_email_accounts.sql migration');
    return;
  }

  console.log('✅ Encryption: SUCCESS');
  console.log(`   Encrypted: ${encrypted.substring(0, 40)}...`);

  // Test 3: Test decryption
  console.log('\n📋 Test 3: Testing password decryption...');

  const { data: decrypted, error: decryptError } = await supabase.rpc('decrypt_email_password', {
    encrypted: encrypted
  });

  if (decryptError) {
    console.log('❌ Decryption FAILED');
    console.log('   Error:', decryptError.message);
    console.log('\n⚠️  DIAGNOSIS: Encryption works but decryption fails.');
    console.log('   POSSIBLE CAUSES:');
    console.log('   - Encryption key mismatch between functions');
    console.log('   - Function uses different key than encryption');
    console.log('   SOLUTION: Re-run FIX_COMPLETE_email_accounts.sql migration');
    return;
  }

  console.log('✅ Decryption: SUCCESS');
  console.log(`   Decrypted: "${decrypted}"`);

  // Test 4: Verify round-trip
  console.log('\n📋 Test 4: Verifying round-trip (encrypt → decrypt)...');

  if (decrypted === testPassword) {
    console.log('✅ Round-trip: SUCCESS');
    console.log('   Original and decrypted passwords MATCH');
  } else {
    console.log('❌ Round-trip: FAILED');
    console.log('   Original:  "' + testPassword + '"');
    console.log('   Decrypted: "' + decrypted + '"');
    console.log('\n⚠️  DIAGNOSIS: Passwords do not match after round-trip.');
    console.log('   This should never happen if encryption/decryption work.');
    console.log('   SOLUTION: Check encryption key in database functions.');
    return;
  }

  // Test 5: Check email_accounts table
  console.log('\n📋 Test 5: Checking email_accounts table...');

  const { data: accounts, error: accountsError } = await supabase
    .from('email_accounts')
    .select('id, email, smtp_pass_encrypted, imap_pass_encrypted')
    .limit(1);

  if (accountsError) {
    if (accountsError.code === '42P01') {
      console.log('⚠️  email_accounts table: NOT FOUND');
      console.log('   The table does not exist yet.');
      console.log('   SOLUTION: Run migrations to create the table.');
    } else {
      console.log('❌ Error checking email_accounts:', accountsError.message);
    }
  } else if (accounts && accounts.length > 0) {
    console.log('✅ email_accounts table: EXISTS');
    console.log(`   Found ${accounts.length} account(s)`);

    // Test decryption of actual stored password
    const account = accounts[0];
    console.log(`\n   Testing stored password for: ${account.email}`);

    if (!account.smtp_pass_encrypted) {
      console.log('   ⚠️  SMTP password is NULL or empty');
    } else {
      const { data: actualDecrypted, error: actualDecryptError } = await supabase.rpc(
        'decrypt_email_password',
        { encrypted: account.smtp_pass_encrypted }
      );

      if (actualDecryptError) {
        console.log('   ❌ SMTP password decryption FAILED');
        console.log('   Error:', actualDecryptError.message);
        console.log('\n⚠️  DIAGNOSIS: Stored passwords cannot be decrypted.');
        console.log('   POSSIBLE CAUSES:');
        console.log('   - Passwords encrypted with old function (different key)');
        console.log('   - Encryption key changed after passwords were stored');
        console.log('   SOLUTION: Users need to re-enter their email passwords');
      } else {
        console.log('   ✅ SMTP password decryption: SUCCESS');
        console.log('   Decrypted password length:', actualDecrypted?.length || 0, 'characters');

        if (actualDecrypted && actualDecrypted.length > 0) {
          console.log('   Password appears valid (non-empty)');
        } else {
          console.log('   ⚠️  Decrypted password is EMPTY');
          console.log('   User needs to re-enter their password');
        }
      }
    }
  } else {
    console.log('⚠️  email_accounts table exists but is EMPTY');
    console.log('   No accounts to test.');
  }

  // Summary
  console.log('\n' + '━'.repeat(60));
  console.log('\n✅ ENCRYPTION SYSTEM TEST COMPLETE\n');
  console.log('Summary:');
  console.log('  - Encryption function: Working');
  console.log('  - Decryption function: Working');
  console.log('  - Round-trip test: Passed');
  console.log('\nIf Zoho authentication is still failing, possible causes:');
  console.log('  1. App-specific password not generated (most common)');
  console.log('  2. Stored passwords encrypted with old key (re-enter passwords)');
  console.log('  3. SMTP/IMAP settings incorrect (check host/port/secure)');
  console.log('  4. Zoho account requires 2FA or additional security');
  console.log('\n');
}

// Run the test
testEncryptionFunctions()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error);
    process.exit(1);
  });
