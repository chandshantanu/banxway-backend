import nodemailer from 'nodemailer';
import Imap from 'imap';
import emailAccountRepository, {
  EmailAccount,
  EmailAccountDecrypted,
  CreateEmailAccountRequest,
  UpdateEmailAccountRequest,
} from '../../database/repositories/email-account.repository';
import { logger } from '../../utils/logger';
import { EmailProviderRegistry } from './email-provider.registry';
import { MXLookupService } from './mx-lookup.service';

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  details?: {
    connected: boolean;
    authenticated: boolean;
    capabilities?: string[];
  };
}

/**
 * Simplified request for creating email account with provider
 */
export interface CreateEmailAccountWithProviderRequest {
  provider?: string; // Provider ID (e.g., "zoho-professional")
  name: string;
  email: string;
  smtp_user?: string; // Optional, defaults to email
  smtp_password: string;
  imap_user?: string; // Optional, defaults to email
  imap_password: string;
  // Optional overrides for advanced mode
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  imap_host?: string;
  imap_port?: number;
  imap_tls?: boolean;
  // Other optional fields
  signature_html?: string;
  signature_text?: string;
  is_default?: boolean;
  auto_assign_to?: string;
  default_tags?: string[];
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
   * Create email account with provider template
   * Simplifies account creation by auto-configuring SMTP/IMAP settings
   */
  async createAccountWithProvider(
    data: CreateEmailAccountWithProviderRequest,
    userId?: string
  ): Promise<EmailAccount> {
    logger.info('Creating email account with provider', {
      email: data.email,
      provider: data.provider || 'auto-detect',
    });

    // Validate email format
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email address format');
    }

    // Check if email already exists
    const existing = await emailAccountRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('An account with this email already exists');
    }

    // Step 1: Detect or get provider config
    let providerConfig = null;

    if (data.provider) {
      // User selected a provider
      providerConfig = EmailProviderRegistry.getProvider(data.provider);
      if (!providerConfig) {
        throw new Error(`Unknown email provider: ${data.provider}`);
      }
      logger.debug('Using selected provider', { provider: data.provider });
    } else {
      // Try to detect provider from email domain
      providerConfig = EmailProviderRegistry.detectFromEmail(data.email);

      if (!providerConfig) {
        // Try MX record lookup
        const mxResult = await MXLookupService.detectProvider(data.email);
        if (mxResult.config) {
          providerConfig = mxResult.config;
          logger.info('Provider detected from MX records', {
            email: data.email,
            provider: providerConfig.id,
            confidence: mxResult.confidence,
          });
        }
      } else {
        logger.info('Provider detected from email domain', {
          email: data.email,
          provider: providerConfig.id,
        });
      }
    }

    // Step 2: Build full account data with provider defaults
    const accountData: CreateEmailAccountRequest = {
      name: data.name,
      email: data.email,

      // SMTP configuration
      smtp_host: data.smtp_host || providerConfig?.smtp.host || 'smtp.zoho.com',
      smtp_port: data.smtp_port ?? providerConfig?.smtp.port ?? 587,
      smtp_secure: data.smtp_secure ?? providerConfig?.smtp.secure ?? false,
      smtp_user: data.smtp_user || data.email,
      smtp_password: data.smtp_password,
      smtp_enabled: true,

      // IMAP configuration
      imap_host: data.imap_host || providerConfig?.imap.host || 'imap.zoho.com',
      imap_port: data.imap_port ?? providerConfig?.imap.port ?? 993,
      imap_tls: data.imap_tls ?? providerConfig?.imap.tls ?? true,
      imap_user: data.imap_user || data.email,
      imap_password: data.imap_password,
      imap_enabled: true,

      // Other fields
      poll_interval_ms: 30000,
      signature_html: data.signature_html,
      signature_text: data.signature_text,
      is_default: data.is_default || false,
      auto_assign_to: data.auto_assign_to,
      default_tags: data.default_tags || [],
    };

    logger.info('Account configuration prepared', {
      email: data.email,
      smtp_host: accountData.smtp_host,
      smtp_port: accountData.smtp_port,
      imap_host: accountData.imap_host,
      imap_port: accountData.imap_port,
      provider: providerConfig?.id || 'custom',
    });

    // Step 3: Create account using existing flow
    return this.createAccount(accountData, userId);
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
