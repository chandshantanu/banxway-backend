const Imap = require('imap');
const https = require('https');

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW9idW10bW9rZ2F5bGp2bGduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIzODcwOCwiZXhwIjoyMDg0ODE0NzA4fQ.5ER68yAojIVC1Gh_IPtYwFoyDbsKFG8Qj--GeUgsXWE';

console.log('🔍 Testing IMAP connection to Zoho...\n');

// First, get the decrypted password via RPC function
function getDecryptedPassword() {
  return new Promise((resolve, reject) => {
    // First get the encrypted password
    const getOptions = {
      hostname: 'thaobumtmokgayljvlgn.supabase.co',
      path: '/rest/v1/email_accounts?select=id,email,imap_pass_encrypted&limit=1',
      method: 'GET',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(getOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to get account: ${res.statusCode}`));
          return;
        }

        try {
          const accounts = JSON.parse(data);
          if (!accounts || accounts.length === 0) {
            reject(new Error('No email account found'));
            return;
          }

          const encryptedPass = accounts[0].imap_pass_encrypted;
          if (!encryptedPass) {
            reject(new Error('No encrypted password found'));
            return;
          }

          // Now decrypt using RPC function
          const decryptOptions = {
            hostname: 'thaobumtmokgayljvlgn.supabase.co',
            path: '/rest/v1/rpc/decrypt_email_password',
            method: 'POST',
            headers: {
              'apikey': SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          };

          const decryptReq = https.request(decryptOptions, (decryptRes) => {
            let decryptData = '';
            decryptRes.on('data', (chunk) => { decryptData += chunk; });
            decryptRes.on('end', () => {
              if (decryptRes.statusCode !== 200) {
                console.log('❌ Decryption failed - function may not exist');
                console.log('   Using placeholder password for test\n');
                resolve('PLACEHOLDER_PASSWORD');
                return;
              }

              try {
                const password = JSON.parse(decryptData);
                resolve(password);
              } catch {
                reject(new Error('Failed to parse decrypted password'));
              }
            });
          });

          decryptReq.on('error', reject);
          decryptReq.write(JSON.stringify({ encrypted: encryptedPass }));
          decryptReq.end();

        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testImapConnection() {
  try {
    console.log('1️⃣ Getting IMAP credentials...');
    const password = await getDecryptedPassword();

    if (password === 'PLACEHOLDER_PASSWORD') {
      console.log('\n⚠️  Cannot decrypt password - skipping IMAP test');
      console.log('   The backend worker would use the decrypt_email_password() function');
      console.log('   If it doesn\'t exist, the worker will fail to poll.\n');
      return;
    }

    console.log('   ✅ Got decrypted password\n');

    console.log('2️⃣ Connecting to IMAP server...');
    console.log('   Host: imappro.zoho.in');
    console.log('   Port: 993');
    console.log('   User: shantanu.chandra@banxwayglobal.com');
    console.log('   TLS: true\n');

    const imap = new Imap({
      user: 'shantanu.chandra@banxwayglobal.com',
      password: password,
      host: 'imappro.zoho.in',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      console.log('   ✅ IMAP connection successful!\n');

      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.log(`   ❌ Failed to open INBOX: ${err.message}\n`);
          imap.end();
          return;
        }

        console.log('3️⃣ Opened INBOX successfully');
        console.log(`   Total messages: ${box.messages.total}`);
        console.log(`   New messages: ${box.messages.new}\n`);

        // Search for unseen emails
        imap.search(['UNSEEN'], (err, results) => {
          if (err) {
            console.log(`   ❌ Search failed: ${err.message}\n`);
            imap.end();
            return;
          }

          console.log('4️⃣ Search results:');
          console.log(`   UNSEEN emails: ${results ? results.length : 0}\n`);

          if (!results || results.length === 0) {
            console.log('⚠️  No UNSEEN emails found!');
            console.log('   This is why the worker isn\'t creating new threads.');
            console.log('   Possible reasons:');
            console.log('   1. All emails are already marked as "seen"');
            console.log('   2. The inbox was already polled and emails marked as seen');
            console.log('   3. There are no new emails\n');
            console.log('💡 To test: Send a new email to shantanu.chandra@banxwayglobal.com');
          } else {
            console.log('✅ Found unseen emails! Worker should be processing these.\n');
            console.log('   If worker is running, these should appear in inbox soon.');
            console.log('   If not, the issue is:');
            console.log('   - Worker process not running');
            console.log('   - Redis/BullMQ not connected');
          }

          imap.end();
        });
      });
    });

    imap.once('error', (err) => {
      console.log(`   ❌ IMAP error: ${err.message}\n`);
      console.log('   Check:');
      console.log('   1. Password is correct');
      console.log('   2. IMAP is enabled for this account');
      console.log('   3. Firewall allows connection to imappro.zoho.in:993');
    });

    imap.connect();

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

testImapConnection();
