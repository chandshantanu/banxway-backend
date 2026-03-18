#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://thaobumtmokgayljvlgn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW9idW10bW9rZ2F5bGp2bGduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTIzODcwOCwiZXhwIjoyMDg0ODE0NzA4fQ.5ER68yAojIVC1Gh_IPtYwFoyDbsKFG8Qj--GeUgsXWE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkMigrations() {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('*')
    .order('executed_at', { ascending: true });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('\n📋 Migrations run in production:\n');
  data.forEach((m, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${m.migration_name}`);
    console.log(`    Executed: ${m.executed_at}`);
    console.log(`    Checksum: ${m.checksum}\n`);
  });
}

checkMigrations();
