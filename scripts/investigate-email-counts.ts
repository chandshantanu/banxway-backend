import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function investigateEmailCounts() {
    console.log('🔍 Investigating Email Count Inflation...\n');

    // 1. Total messages
    const { count: totalMessages } = await supabase
        .from('communication_messages')
        .select('*', { count: 'exact', head: true });

    console.log(`📊 Total Messages: ${totalMessages}`);

    // 2. Messages with external_id (emails)
    const { data: messagesWithExtId, count: emailCount } = await supabase
        .from('communication_messages')
        .select('external_id', { count: 'exact' })
        .not('external_id', 'is', null);

    console.log(`📧 Messages with external_id (emails): ${emailCount}`);

    // 3. Unique external_ids
    const uniqueExternalIds = new Set(messagesWithExtId?.map(m => m.external_id) || []);
    console.log(`✅ Unique external_ids: ${uniqueExternalIds.size}`);
    console.log(`⚠️  Duplicates: ${emailCount! - uniqueExternalIds.size}\n`);

    // 4. Find actual duplicates
    if (messagesWithExtId) {
        const externalIdCounts: Record<string, number> = {};
        messagesWithExtId.forEach(m => {
            if (m.external_id) {
                externalIdCounts[m.external_id] = (externalIdCounts[m.external_id] || 0) + 1;
            }
        });

        const duplicates = Object.entries(externalIdCounts)
            .filter(([_, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        if (duplicates.length > 0) {
            console.log('🔴 Top Duplicate Message-IDs:');
            duplicates.forEach(([id, count]) => {
                console.log(`  - ${id.substring(0, 50)}... (${count} copies)`);
            });
            console.log('');
        }
    }

    // 5. Thread count
    const { count: threadCount } = await supabase
        .from('communication_threads')
        .select('*', { count: 'exact', head: true })
        .eq('archived', false);

    console.log(`🧵 Active Threads: ${threadCount}`);

    // 6. Breakdown by channel
    const { data: channelBreakdown } = await supabase
        .from('communication_messages')
        .select('channel, direction');

    if (channelBreakdown) {
        const breakdown: Record<string, Record<string, number>> = {};
        channelBreakdown.forEach(m => {
            const channel = m.channel || 'UNKNOWN';
            const direction = m.direction || 'UNKNOWN';
            if (!breakdown[channel]) breakdown[channel] = {};
            breakdown[channel][direction] = (breakdown[channel][direction] || 0) + 1;
        });

        console.log('\n📈 Breakdown by Channel:');
        Object.entries(breakdown).forEach(([channel, dirs]) => {
            console.log(`  ${channel}:`);
            Object.entries(dirs).forEach(([dir, count]) => {
                console.log(`    ${dir}: ${count}`);
            });
        });
    }

    // 7. Sample duplicate messages
    if (messagesWithExtId && uniqueExternalIds.size < emailCount!) {
        console.log('\n🔎 Sample Duplicate Messages:');
        const { data: duplicateMessages } = await supabase
            .from('communication_messages')
            .select('id, external_id, thread_id, created_at, from_address, subject')
            .not('external_id', 'is', null)
            .order('external_id')
            .limit(200);

        if (duplicateMessages) {
            const grouped: Record<string, any[]> = {};
            duplicateMessages.forEach(msg => {
                if (msg.external_id) {
                    if (!grouped[msg.external_id]) grouped[msg.external_id] = [];
                    grouped[msg.external_id].push(msg);
                }
            });

            const actualDuplicates = Object.entries(grouped)
                .filter(([_, msgs]) => msgs.length > 1)
                .slice(0, 3);

            actualDuplicates.forEach(([extId, msgs]) => {
                console.log(`\n  External ID: ${extId.substring(0, 60)}...`);
                msgs.forEach(msg => {
                    console.log(`    - Message ${msg.id.substring(0, 8)} | Thread: ${msg.thread_id.substring(0, 8)} | ${msg.created_at}`);
                });
            });
        }
    }

    console.log('\n✅ Investigation Complete');
}

investigateEmailCounts().catch(console.error);
