require('dotenv').config();
const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function query(table, select = '*', filters = {}) {
    return new Promise((resolve, reject) => {
        let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
        Object.entries(filters).forEach(([key, value]) => {
            url += `&${key}=${value}`;
        });

        const options = {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'count=exact'
            }
        };

        const protocol = url.startsWith('https:') ? https : http;

        protocol.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const count = res.headers['content-range']?.split('/')[1];
                resolve({ data: JSON.parse(data || '[]'), count: parseInt(count || '0') });
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('🔍 Investigating Email Counts...\n');

    // 1. Total messages
    const totalResult = await query('communication_messages', 'id');
    console.log(`📊 Total Messages: ${totalResult.count}`);

    // 2. Messages with external_id (emails)
    const emailResult = await query('communication_messages', 'external_id', { 'external_id': 'not.is.null' });
    console.log(`📧 Messages with external_id: ${emailResult.count}`);

    // 3. Count unique external_ids
    const uniqueIds = new Set(emailResult.data.map(m => m.external_id));
    console.log(`✅ Unique external_ids: ${uniqueIds.size}`);
    console.log(`⚠️  DUPLICATES: ${emailResult.count - uniqueIds.size}\n`);

    // 4. Thread count
    const threadsResult = await query('communication_threads', 'id', { 'archived': 'eq.false' });
    console.log(`🧵 Active Threads: ${threadsResult.count}\n`);

    // 5. Find duplicates
    const counts = {};
    emailResult.data.forEach(m => {
        counts[m.external_id] = (counts[m.external_id] || 0) + 1;
    });

    const duplicates = Object.entries(counts)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    if (duplicates.length > 0) {
        console.log('🔴 Top 10 Duplicate Message-IDs:');
        duplicates.forEach(([id, count]) => {
            console.log(`  ${count}x - ${id.substring(0, 60)}...`);
        });
    }

    console.log('\n✅ Investigation Complete\n');
    console.log(`📊 SUMMARY:`);
    console.log(`   You have ${uniqueIds.size} actual unique emails`);
    console.log(`   Database shows ${emailResult.count} total email records`);
    console.log(`   = ${emailResult.count - uniqueIds.size} duplicate records!\n`);
}

main().catch(console.error);
