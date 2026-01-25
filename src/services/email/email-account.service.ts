import nodemailer from 'nodemailer';
import Imap from 'imap';
import emailAccountRepository, {
  EmailAccount,
  EmailAccountDecrypted,
  CreateEmailAccountRequest,
  UpdateEmailAccountRequest,
} from '../../database/repositories/email-account.repository';
import { logger } from '../../utils/logger';

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  details?: {
    connected: boolean;
    authenticated: boolean;
    capabilities?: string[];
  };
}

class EmailAccountService {
  /**
   * Get all email accounts
   */
  async getAllAccounts(includeInactive = false): Promise<EmailAccount[]> {
    return emailAccountRepository.findAll(includeInactive);
  }

  /**
   * Get accounts enabled for polling
   */
  async getPollingAccounts(): Promise<EmailAccount[]> {
    return emailAccountRepository.findPollingEnabled();
  }

  /**
   * Get an account by ID
   */
  async getAccount(id: string): Promise<EmailAccount | null> {
    return emailAccountRepository.findById(id);
  }

  /**
   * Get the default sending account
   */
  async getDefaultAccount(): Promise<EmailAccount | null> {
    return emailAccountRepository.findDefault();
  }

  /**
   * Get account with decrypted passwords (for sending/polling)
   */
  async getAccountWithCredentials(id: string): Promise<EmailAccountDecrypted | null> {
    return emailAccountRepository.getWithDecryptedPasswords(id);
  }

  /**
   * Create a new email account
   */
  async createAccount(data: CreateEmailAccountRequest, userId?: string): Promise<EmailAccount> {
    // Validate email format
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email address format');
    }

    // Check if email already exists
    const existing = await emailAccountRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('An account with this email already exists');
    }

    return emailAccountRepository.create(data, userId);
  }

  /**
   * Update an email account
   */
  async updateAccount(id: string, updates: UpdateEmailAccountRequest): Promise<EmailAccount> {
    const existing = await emailAccountRepository.findById(id);
    if (!existing) {
      throw new Error('Email account not found');
    }

    return emailAccountRepository.update(id, updates);
  }

  /**
   * Delete an email account
   */
  async deleteAccount(id: string): Promise<void> {
    const existing = await emailAccountRepository.findById(id);
    if (!existing) {
      throw new Error('Email account not found');
    }

    // Prevent deleting the default account
    if (existing.is_default) {
      throw new Error('Cannot delete the default email account. Set another account as default first.');
    }

    return emailAccountRepository.delete(id);
  }

  /**
   * Test SMTP connection for an account
   */
  async testSmtpConnection(accountId: string): Promise<TestConnectionResult> {
    const account = await emailAccountRepository.getWithDecryptedPasswords(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: account.smtp_host,
        port: account.smtp_port,
        secure: account.smtp_secure,
        auth: {
          user: account.smtp_user,
          pass: account.smtp_password,
        },
        connectionTimeout: 10000,
      });

      await transporter.verify();
      transporter.close();

      logger.info('SMTP connection test successful', { accountId, email: account.email });
      return {
        success: true,
        details: {
          connected: true,
          authenticated: true,
        },
      };
    } catch (error: any) {
      logger.error('SMTP connection test failed', { accountId, error: error.message });
      return {
        success: false,
        error: error.message,
        details: {
          connected: false,
          authenticated: false,
        },
      };
    }
  }

  /**
   * Test IMAP connection for an account
   */
  async testImapConnection(accountId: string): Promise<TestConnectionResult> {
    const account = await emailAccountRepository.getWithDecryptedPasswords(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    return new Promise((resolve) => {
      const imap = new Imap({
        user: account.imap_user,
        password: account.imap_password,
        host: account.imap_host,
        port: account.imap_port,
        tls: account.imap_tls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 10000,
      });

      const timeout = setTimeout(() => {
        imap.end();
        resolve({
          success: false,
          error: 'Connection timeout',
          details: {
            connected: false,
            authenticated: false,
          },
        });
      }, 15000);

      imap.once('ready', () => {
        clearTimeout(timeout);
        const capabilities = imap.serverSupports('IDLE') ? ['IDLE'] : [];
        imap.end();

        logger.info('IMAP connection test successful', { accountId, email: account.email });
        resolve({
          success: true,
          details: {
            connected: true,
            authenticated: true,
            capabilities,
          },
        });
      });

      imap.once('error', (err: Error) => {
        clearTimeout(timeout);
        logger.error('IMAP connection test failed', { accountId, error: err.message });
        resolve({
          success: false,
          error: err.message,
          details: {
            connected: false,
            authenticated: false,
          },
        });
      });

      imap.connect();
    });
  }

  /**
   * Test both SMTP and IMAP connections
   */
  async testAllConnections(accountId: string): Promise<{
    smtp: TestConnectionResult;
    imap: TestConnectionResult;
  }> {
    const [smtp, imap] = await Promise.all([
      this.testSmtpConnection(accountId),
      this.testImapConnection(accountId),
    ]);

    return { smtp, imap };
  }

  /**
   * Update poll status after polling attempt
   */
  async updatePollStatus(accountId: string, status: 'SUCCESS' | 'FAILED', error?: string): Promise<void> {
    await emailAccountRepository.updatePollStatus(accountId, status, error);
  }

  /**
   * Set an account as the default
   */
  async setAsDefault(accountId: string): Promise<EmailAccount> {
    return emailAccountRepository.update(accountId, { is_default: true });
  }

  /**
   * Enable/disable an account
   */
  async setActiveStatus(accountId: string, isActive: boolean): Promise<EmailAccount> {
    return emailAccountRepository.update(accountId, { is_active: isActive });
  }

  /**
   * Enable/disable IMAP polling for an account
   */
  async setPollingEnabled(accountId: string, enabled: boolean): Promise<EmailAccount> {
    return emailAccountRepository.update(accountId, { imap_enabled: enabled });
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export default new EmailAccountService();
