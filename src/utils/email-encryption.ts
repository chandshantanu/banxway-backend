/**
 * Email Password Encryption Utilities
 *
 * Uses direct PostgreSQL connection instead of Supabase RPC
 * to avoid API key issues while maintaining encryption functionality.
 */

import { Client } from 'pg';
import { logger } from './logger';

/**
 * Get PostgreSQL client from environment
 */
function getDatabaseUrl(): string {
  // Try various environment variable names
  return (
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    ''
  );
}

/**
 * Encrypt a password using PostgreSQL function
 */
export async function encryptEmailPassword(password: string): Promise<string> {
  const DATABASE_URL = getDatabaseUrl();

  if (!DATABASE_URL) {
    logger.error('DATABASE_URL not configured - cannot encrypt password');
    throw new Error('Database connection not configured for encryption');
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT encrypt_email_password($1) as encrypted',
      [password]
    );

    return result.rows[0].encrypted;
  } catch (error: any) {
    logger.error('Error encrypting email password via direct SQL', {
      error: error.message,
    });
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Decrypt a password using PostgreSQL function
 */
export async function decryptEmailPassword(encrypted: string): Promise<string> {
  const DATABASE_URL = getDatabaseUrl();

  if (!DATABASE_URL) {
    logger.error('DATABASE_URL not configured - cannot decrypt password');
    throw new Error('Database connection not configured for decryption');
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT decrypt_email_password($1) as decrypted',
      [encrypted]
    );

    return result.rows[0].decrypted;
  } catch (error: any) {
    logger.error('Error decrypting email password via direct SQL', {
      error: error.message,
    });
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Decrypt multiple passwords in parallel
 */
export async function decryptMultiplePasswords(
  encrypted: { smtp: string; imap: string }
): Promise<{ smtp: string; imap: string }> {
  const [smtp, imap] = await Promise.all([
    decryptEmailPassword(encrypted.smtp),
    decryptEmailPassword(encrypted.imap),
  ]);

  return { smtp, imap };
}
