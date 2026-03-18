
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Create a standalone supabase client since we can't easily import the app's config 
// if it relies on other app initialization logic, but let's try importing first.
// Actually, usually safer to minimal setup.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://thaobumtmokgayljvlgn.supabase.co';
// Use SERVICE_ROLE_KEY to bypass RLS and see if user exists at all
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or keys');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    const email = 'shantanu.chandra@banxwayglobal.com';
    console.log(`Checking user: ${email} against ${supabaseUrl}`);

    // 1. Check Auth Users (Admin only)
    // We need service role key for this
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
        console.error('Auth List Error (needs service role key):', authError.message);
    } else {
        const authUser = users.find(u => u.email === email);
        if (authUser) {
            console.log('✅ Found in auth.users:', authUser.id);

            // 2. Check Public Users
            const { data: publicUser, error: publicError } = await supabase
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (publicError) {
                console.error('❌ Error fetching public.users:', publicError.message);
                console.log('User MISSING in public.users table!');
            } else if (publicUser) {
                console.log('✅ Found in public.users:', publicUser);
            } else {
                console.log('❌ User MISSING in public.users table (no error but no data?)');
            }

        } else {
            console.log('❌ User NOT found in auth.users');
        }
    }
}

checkUser().catch(console.error);
