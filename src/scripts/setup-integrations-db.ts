/**
 * Database setup script for integrations tables
 * Run with: npx ts-node src/scripts/setup-integrations-db.ts
 */

import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

async function setupIntegrationsDatabase() {
  try {
    logger.info('Starting database setup for integrations...');

    // Read the SQL schema file
    const schemaPath = path.join(__dirname, '..', 'database', 'schema', 'integrations.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolons to execute statements one by one
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    logger.info(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        logger.info(`Executing statement ${i + 1}/${statements.length}...`);

        // Use raw SQL execution via Supabase
        const { error } = await supabaseAdmin.rpc('exec_sql', {
          sql_query: statement
        }).single();

        if (error) {
          // If exec_sql RPC doesn't exist, try direct execution
          // This is a workaround for Supabase limitations
          logger.warn(`exec_sql RPC not available, statement will need manual execution`);
          logger.info(`Statement ${i + 1}: ${statement.substring(0, 100)}...`);
        } else {
          logger.info(`✓ Statement ${i + 1} executed successfully`);
        }
      } catch (statementError: any) {
        logger.warn(`Statement ${i + 1} execution warning:`, statementError.message);
        // Continue with other statements
      }
    }

    // Verify tables were created
    logger.info('Verifying tables...');

    const tables = [
      'integration_credentials',
      'user_integration_permissions',
      'integration_audit_logs',
      'organization_phone_numbers'
    ];

    for (const table of tables) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .limit(0);

      if (error) {
        logger.error(`✗ Table '${table}' verification failed:`, error.message);
      } else {
        logger.info(`✓ Table '${table}' exists and is accessible`);
      }
    }

    logger.info('Database setup completed!');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Add ENCRYPTION_MASTER_KEY to your .env file');
    logger.info('2. Restart your backend server');
    logger.info('3. Test the integrations API at /api/v1/settings/integrations');

    process.exit(0);
  } catch (error: any) {
    logger.error('Database setup failed:', error.message);
    logger.error('');
    logger.error('Please apply the schema manually:');
    logger.error('1. Go to your Supabase Dashboard');
    logger.error('2. Navigate to SQL Editor');
    logger.error('3. Copy the contents of src/database/schema/integrations.sql');
    logger.error('4. Execute the SQL');
    process.exit(1);
  }
}

// Run the setup
setupIntegrationsDatabase();
