#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');

async function applyPermissions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('\n🔧 Applying function permissions...\n');

    const sql = fs.readFileSync('fix-function-permissions.sql', 'utf8');

    await client.query(sql);

    console.log('✅ Permissions applied successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

applyPermissions();
