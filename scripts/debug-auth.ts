
import * as dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env vars (though we will start with hardcoded or passed in vars)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://thaobumtmokgayljvlgn.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    process.exit(1);
}

// Client for Auth (simulating frontend)
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAuth() {
    const email = 'shantanu.chandra@banxwayglobal.com';
    const password = 'BanxwayAdmin@2026';
    const backendUrl = 'https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1/communications/threads';

    console.log(`1. Logging in as ${email}...`);
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error('❌ Login Failed:', error.message);
        return;
    }

    if (!data.session) {
        console.error('❌ Login success but no session returned?');
        return;
    }

    console.log('✅ Login Successful');
    console.log('Access Token (first 20 chars):', data.session.access_token.substring(0, 20) + '...');

    const token = data.session.access_token;

    console.log('2. Making HTTP Request to Backend...');
    try {
        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log('Response Body:', text.substring(0, 500)); // First 500 chars

        if (response.status === 200) {
            console.log('✅ BACKEND ACCEPTED TOKEN! Issue is likely in Frontend execution/storage.');
        } else {
            console.log('❌ BACKEND REJECTED TOKEN! Issue is in Backend Validation.');
        }

    } catch (err) {
        console.error('Request Error:', err);
    }
}

debugAuth().catch(console.error);
