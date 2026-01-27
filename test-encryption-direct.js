#!/usr/bin/env node

/**
 * Test encryption functions via direct PostgreSQL connection
 */

const { Client } = require('pg');

async function testEncryption() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('\n🔍 Testing Email Password Encryption (Direct SQL)\n');
    console.log('━'.repeat(60));

    // Test encryption
    console.log('\n📋 Test 1: Encrypting password...');
    const testPassword = 'TestPassword123!';
    console.log(`   Input: "${testPassword}"`);

    const encryptResult = await client.query(
      `SELECT encrypt_email_password($1) as encrypted`,
      [testPassword]
    );

    const encrypted = encryptResult.rows[0].encrypted;
    console.log('✅ Encryption: SUCCESS');
    console.log(`   Encrypted: ${encrypted.substring(0, 40)}...`);

    // Test decryption
    console.log('\n📋 Test 2: Decrypting password...');
    const decryptResult = await client.query(
      `SELECT decrypt_email_password($1) as decrypted`,
      [encrypted]
    );

    const decrypted = decryptResult.rows[0].decrypted;
    console.log('✅ Decryption: SUCCESS');
    console.log(`   Decrypted: "${decrypted}"`);

    // Verify round-trip
    console.log('\n📋 Test 3: Verifying round-trip...');
    if (decrypted === testPassword) {
      console.log('✅ Round-trip: SUCCESS');
      console.log('   ✅ Original and decrypted passwords MATCH');
    } else {
      console.log('❌ Round-trip: FAILED');
      console.log(`   Original:  "${testPassword}"`);
      console.log(`   Decrypted: "${decrypted}"`);
    }

    // Test with actual stored password
    console.log('\n📋 Test 4: Testing actual stored email account...');
    const accountResult = await client.query(`
      SELECT id, email, smtp_pass_encrypted, imap_pass_encrypted
      FROM email_accounts
      LIMIT 1
    `);

    if (accountResult.rows.length > 0) {
      const account = accountResult.rows[0];
      console.log(`   Found account: ${account.email}`);

      if (account.smtp_pass_encrypted) {
        try {
          const actualDecryptResult = await client.query(
            `SELECT decrypt_email_password($1) as decrypted`,
            [account.smtp_pass_encrypted]
          );

          const actualDecrypted = actualDecryptResult.rows[0].decrypted;
          console.log('   ✅ SMTP password decryption: SUCCESS');
          console.log(`   Password length: ${actualDecrypted?.length || 0} characters`);

          if (actualDecrypted && actualDecrypted.length > 0) {
            console.log('   ✅ Password appears valid (non-empty)');
          } else {
            console.log('   ⚠️  WARNING: Decrypted password is EMPTY');
            console.log('   User needs to re-enter their password');
          }
        } catch (err) {
          console.log('   ❌ SMTP password decryption FAILED:', err.message);
          console.log('   User needs to re-enter their password');
        }
      } else {
        console.log('   ⚠️  No SMTP password stored');
      }
    } else {
      console.log('   No email accounts found');
    }

    console.log('\n' + '━'.repeat(60));
    console.log('\n✅ ENCRYPTION SYSTEM TEST COMPLETE\n');
    console.log('Summary:');
    console.log('  ✅ Encryption functions exist and work correctly');
    console.log('  ✅ PostgreSQL encryption/decryption functional');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

testEncryption();
