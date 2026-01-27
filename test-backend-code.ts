import emailAccountService from './src/services/email/email-account.service';
import { logger } from './src/utils/logger';

async function test() {
  console.log('🔍 Testing backend code directly...\n');

  try {
    console.log('1️⃣ Calling emailAccountService.getAllAccounts(false)...');
    const accounts = await emailAccountService.getAllAccounts(false);

    console.log(`   Result: ${accounts.length} account(s)`);

    if (accounts.length === 0) {
      console.log('   ❌ No accounts returned!\n');

      console.log('2️⃣ Trying with includeInactive=true...');
      const allAccounts = await emailAccountService.getAllAccounts(true);
      console.log(`   Result: ${allAccounts.length} account(s)`);

      if (allAccounts.length > 0) {
        console.log('\n   ✅ Found accounts with includeInactive=true:');
        allAccounts.forEach(acc => {
          console.log(`      - ${acc.email} (active: ${acc.is_active})`);
        });
      }
    } else {
      console.log('   ✅ Found accounts:');
      accounts.forEach(acc => {
        console.log(`      - ${acc.email} (active: ${acc.is_active})`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

test().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
