import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encryption service for securely storing integration credentials
 * Uses AES-256-GCM for authenticated encryption
 */
export class EncryptionService {
  private masterKey: Buffer;

  constructor() {
    // Get master key from environment
    const key = process.env.ENCRYPTION_MASTER_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
      throw new Error('ENCRYPTION_MASTER_KEY not configured');
    }

    // Derive a 32-byte key from the master key
    this.masterKey = crypto.scryptSync(key, 'salt', KEY_LENGTH);
  }

  /**
   * Encrypt plaintext data
   * Returns encrypted data in format: iv:tag:encrypted
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      // Format: iv:tag:encrypted
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted data
   * Expects format: iv:tag:encrypted
   */
  decrypt(ciphertext: string): string {
    try {
      const [ivHex, tagHex, encrypted] = ciphertext.split(':');

      if (!ivHex || !tagHex || !encrypted) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt an object by converting to JSON first
   */
  encryptObject(obj: Record<string, any>): string {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  /**
   * Decrypt and parse as JSON object
   */
  decryptObject(ciphertext: string): Record<string, any> {
    const jsonString = this.decrypt(ciphertext);
    return JSON.parse(jsonString);
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
