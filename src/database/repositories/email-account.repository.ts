import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass_encrypted: string;
  smtp_secure: boolean;
  smtp_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass_encrypted: string;
  imap_tls: boolean;
  imap_enabled: boolean;
  poll_interval_ms: number;
  last_polled_at: string | null;
  last_poll_status: string | null;
  last_poll_error: string | null;
  signature_html: string | null;
  signature_text: string | null;
  is_default: boolean;
  is_active: boolean;
  auto_assign_to: string | null;
  default_tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailAccountDecrypted extends Omit<EmailAccount, 'smtp_pass_encrypted' | 'imap_pass_encrypted'> {
  smtp_password: string;
  imap_password: string;
}

export interface CreateEmailAccountRequest {
  name: string;
  email: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user: string;
  smtp_password: string;
  smtp_secure?: boolean;
  smtp_enabled?: boolean;
  imap_host?: string;
  imap_port?: number;
  imap_user: string;
  imap_password: string;
  imap_tls?: boolean;
  imap_enabled?: boolean;
  poll_interval_ms?: number;
  signature_html?: string;
  signature_text?: string;
  is_default?: boolean;
  auto_assign_to?: string;
  default_tags?: string[];
}

export interface UpdateEmailAccountRequest {
  name?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_secure?: boolean;
  smtp_enabled?: boolean;
  imap_host?: string;
  imap_port?: number;
  imap_user?: string;
  imap_password?: string;
  imap_tls?: boolean;
  imap_enabled?: boolean;
  poll_interval_ms?: number;
  signature_html?: string;
  signature_text?: string;
  is_default?: boolean;
  is_active?: boolean;
  auto_assign_to?: string | null;
  default_tags?: string[];
}

class EmailAccountRepository {
  /**
   * Check if email_accounts table exists and is accessible
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' || // PostgreSQL: undefined_table
      error.message?.includes('email_accounts') && error.message?.includes('not found') ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all active email accounts
   */
  async findAll(includeInactive = false): Promise<EmailAccount[]> {
    let query = supabaseAdmin
      .from('email_accounts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      // If table doesn't exist yet, return empty array (graceful degradation)
      if (this.isTableMissingError(error)) {
        logger.debug('Email accounts table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching email accounts', { error: error.message });
      throw error;
    }

    return data as EmailAccount[];
  }

  /**
   * Find accounts enabled for IMAP polling
   */
  async findPollingEnabled(): Promise<EmailAccount[]> {
    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('is_active', true)
      .eq('imap_enabled', true)
      .order('name', { ascending: true });

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01' || error.message?.includes('not found')) {
        logger.debug('Email accounts table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching polling-enabled accounts', { error: error.message });
      throw error;
    }

    return data as EmailAccount[];
  }

  /**
   * Find an email account by ID
   */
  async findById(id: string): Promise<EmailAccount | null> {
    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      // If table doesn't exist, return null (graceful degradation)
      if (this.isTableMissingError(error)) {
        logger.debug('Email accounts table not found - returning null');
        return null;
      }

      logger.error('Error fetching email account', { id, error: error.message });
      throw error;
    }

    return data as EmailAccount;
  }

  /**
   * Find an email account by email address
   */
  async findByEmail(email: string): Promise<EmailAccount | null> {
    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found

      // If table doesn't exist, return null (graceful degradation)
      if (this.isTableMissingError(error)) {
        logger.debug('Email accounts table not found - returning null');
        return null;
      }

      logger.error('Error fetching email account by email', { email, error: error.message });
      throw error;
    }

    return data as EmailAccount;
  }

  /**
   * Get the default sending account
   */
  async findDefault(): Promise<EmailAccount | null> {
    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      // If table doesn't exist, return null (graceful degradation)
      if (this.isTableMissingError(error)) {
        logger.debug('Email accounts table not found - returning null');
        return null;
      }

      logger.error('Error fetching default account', { error: error.message });
      throw error;
    }

    return data as EmailAccount;
  }

  /**
   * Get decrypted password for an account
   */
  async getDecryptedPassword(accountId: string, type: 'smtp' | 'imap'): Promise<string> {
    logger.debug('Getting decrypted password', { accountId, type });

    const column = type === 'smtp' ? 'smtp_pass_encrypted' : 'imap_pass_encrypted';
    const account = await this.findById(accountId);

    if (!account) {
      logger.warn('Account not found for decryption', { accountId });
      throw new Error('Account not found');
    }

    try {
      const { data, error } = await supabaseAdmin.rpc('decrypt_email_password', {
        encrypted: account[column],
      });

      if (error) {
        logger.error('Error decrypting password via RPC', {
          accountId,
          type,
          error: error.message,
          code: error.code,
        });
        throw error;
      }

      logger.debug('Password decrypted successfully', { accountId, type });
      return data as string;
    } catch (error: any) {
      logger.error('Failed to decrypt password', {
        accountId,
        type,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get account with decrypted passwords (for polling/sending)
   */
  async getWithDecryptedPasswords(accountId: string): Promise<EmailAccountDecrypted | null> {
    logger.info('Getting account with decrypted passwords', { accountId });

    const account = await this.findById(accountId);
    if (!account) {
      logger.warn('Account not found for decryption', { accountId });
      return null;
    }

    try {
      logger.debug('Decrypting passwords via RPC', {
        accountId,
        email: account.email,
        hasSmtpPassword: !!account.smtp_pass_encrypted,
        hasImapPassword: !!account.imap_pass_encrypted,
      });

      // Decrypt passwords using PostgreSQL function via Supabase RPC
      const [smtpResult, imapResult] = await Promise.all([
        supabaseAdmin.rpc('decrypt_email_password', { encrypted: account.smtp_pass_encrypted }),
        supabaseAdmin.rpc('decrypt_email_password', { encrypted: account.imap_pass_encrypted }),
      ]);

      if (smtpResult.error || imapResult.error) {
        logger.error('Error decrypting passwords via RPC', {
          accountId,
          email: account.email,
          smtpError: smtpResult.error?.message,
          smtpCode: smtpResult.error?.code,
          imapError: imapResult.error?.message,
          imapCode: imapResult.error?.code,
        });
        throw smtpResult.error || imapResult.error;
      }

      logger.info('Passwords decrypted successfully', {
        accountId,
        email: account.email,
        smtpPasswordLength: (smtpResult.data as string)?.length || 0,
        imapPasswordLength: (imapResult.data as string)?.length || 0,
      });

      const { smtp_pass_encrypted, imap_pass_encrypted, ...accountWithoutPasswords } = account;

      return {
        ...accountWithoutPasswords,
        smtp_password: smtpResult.data as string,
        imap_password: imapResult.data as string,
      };
    } catch (error: any) {
      logger.error('Failed to get account with decrypted passwords', {
        accountId,
        email: account.email,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Create a new email account
   */
  async create(accountData: CreateEmailAccountRequest, userId?: string): Promise<EmailAccount> {
    logger.info('Creating new email account', {
      email: accountData.email,
      name: accountData.name,
      smtp_enabled: accountData.smtp_enabled,
      imap_enabled: accountData.imap_enabled,
      userId,
    });

    try {
      logger.debug('Encrypting passwords via RPC', {
        email: accountData.email,
        hasSmtpPassword: !!accountData.smtp_password,
        hasImapPassword: !!accountData.imap_password,
        smtpPasswordLength: accountData.smtp_password?.length || 0,
        imapPasswordLength: accountData.imap_password?.length || 0,
      });

      // Encrypt passwords using Supabase RPC
      const [smtpResult, imapResult] = await Promise.all([
        supabaseAdmin.rpc('encrypt_email_password', { password: accountData.smtp_password }),
        supabaseAdmin.rpc('encrypt_email_password', { password: accountData.imap_password }),
      ]);

      if (smtpResult.error || imapResult.error) {
        logger.error('Error encrypting passwords via RPC', {
          email: accountData.email,
          smtpError: smtpResult.error?.message,
          smtpCode: smtpResult.error?.code,
          imapError: imapResult.error?.message,
          imapCode: imapResult.error?.code,
        });
        throw smtpResult.error || imapResult.error;
      }

      const smtpEncrypted = smtpResult.data as string;
      const imapEncrypted = imapResult.data as string;

      logger.debug('Passwords encrypted successfully', {
        email: accountData.email,
        smtpEncryptedLength: smtpEncrypted?.length || 0,
        imapEncryptedLength: imapEncrypted?.length || 0,
      });

    // If this is the first account or marked as default, ensure only one default
    if (accountData.is_default) {
      await this.clearDefaultFlag();
    }

    const newAccount = {
      name: accountData.name,
      email: accountData.email,
      smtp_host: accountData.smtp_host || 'smtp.zoho.com',
      smtp_port: accountData.smtp_port || 587,
      smtp_user: accountData.smtp_user,
      smtp_pass_encrypted: smtpEncrypted,
      smtp_secure: accountData.smtp_secure || false,
      smtp_enabled: accountData.smtp_enabled !== false,
      imap_host: accountData.imap_host || 'imap.zoho.com',
      imap_port: accountData.imap_port || 993,
      imap_user: accountData.imap_user,
      imap_pass_encrypted: imapEncrypted,
      imap_tls: accountData.imap_tls !== false,
      imap_enabled: accountData.imap_enabled !== false,
      poll_interval_ms: accountData.poll_interval_ms || 30000,
      signature_html: accountData.signature_html || null,
      signature_text: accountData.signature_text || null,
      is_default: accountData.is_default || false,
      is_active: true,
      auto_assign_to: accountData.auto_assign_to || null,
      default_tags: accountData.default_tags || [],
      created_by: userId || null,
    };

    logger.debug('Inserting email account into database', {
      email: newAccount.email,
      name: newAccount.name,
      smtp_enabled: newAccount.smtp_enabled,
      imap_enabled: newAccount.imap_enabled,
      is_default: newAccount.is_default,
    });

    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .insert(newAccount)
      .select()
      .single();

    if (error) {
      logger.error('Error creating email account', {
        email: newAccount.email,
        error: error.message,
        code: error.code,
      });
      throw error;
    }

    logger.info('Email account created successfully', {
      id: data.id,
      email: data.email,
      name: data.name,
      smtp_enabled: data.smtp_enabled,
      imap_enabled: data.imap_enabled,
    });
    return data as EmailAccount;
  } catch (error: any) {
    logger.error('Failed to create email account', {
      email: accountData.email,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
  }

  /**
   * Update an email account
   */
  async update(id: string, updates: UpdateEmailAccountRequest): Promise<EmailAccount> {
    logger.info('Updating email account', {
      id,
      hasSmtpPassword: !!updates.smtp_password,
      hasImapPassword: !!updates.imap_password,
      fields: Object.keys(updates),
    });

    try {
      const updateData: any = { ...updates };

      // Handle password updates with RPC encryption
      if (updates.smtp_password) {
        logger.debug('Encrypting SMTP password via RPC', {
          id,
          smtpPasswordLength: updates.smtp_password.length,
        });

        const smtpResult = await supabaseAdmin.rpc('encrypt_email_password', {
          password: updates.smtp_password,
        });

        if (smtpResult.error) {
          logger.error('Error encrypting SMTP password via RPC', {
            id,
            error: smtpResult.error.message,
            code: smtpResult.error.code,
          });
          throw smtpResult.error;
        }

        updateData.smtp_pass_encrypted = smtpResult.data as string;
        delete updateData.smtp_password;

        logger.debug('SMTP password encrypted successfully', {
          id,
          encryptedLength: (smtpResult.data as string)?.length || 0,
        });
      }

      if (updates.imap_password) {
        logger.debug('Encrypting IMAP password via RPC', {
          id,
          imapPasswordLength: updates.imap_password.length,
        });

        const imapResult = await supabaseAdmin.rpc('encrypt_email_password', {
          password: updates.imap_password,
        });

        if (imapResult.error) {
          logger.error('Error encrypting IMAP password via RPC', {
            id,
            error: imapResult.error.message,
            code: imapResult.error.code,
          });
          throw imapResult.error;
        }

        updateData.imap_pass_encrypted = imapResult.data as string;
        delete updateData.imap_password;

        logger.debug('IMAP password encrypted successfully', {
          id,
          encryptedLength: (imapResult.data as string)?.length || 0,
        });
      }

      // Handle default flag
      if (updates.is_default) {
        logger.debug('Clearing default flag from other accounts', { id });
        await this.clearDefaultFlag();
      }

      logger.debug('Updating email account in database', {
        id,
        fields: Object.keys(updateData),
      });

      const { data, error } = await supabaseAdmin
        .from('email_accounts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating email account', {
          id,
          error: error.message,
          code: error.code,
        });
        throw error;
      }

      logger.info('Email account updated successfully', {
        id,
        email: data.email,
        updatedFields: Object.keys(updateData),
      });
      return data as EmailAccount;
    } catch (error: any) {
      logger.error('Failed to update email account', {
        id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Delete an email account
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('email_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting email account', { id, error: error.message });
      throw error;
    }

    logger.info('Email account deleted', { id });
  }

  /**
   * Update poll status for an account
   */
  async updatePollStatus(id: string, status: 'SUCCESS' | 'FAILED', error?: string): Promise<void> {
    const { error: updateError } = await supabaseAdmin
      .from('email_accounts')
      .update({
        last_polled_at: new Date().toISOString(),
        last_poll_status: status,
        last_poll_error: error || null,
      })
      .eq('id', id);

    if (updateError) {
      logger.error('Error updating poll status', { id, error: updateError.message });
    }
  }

  /**
   * Clear default flag from all accounts
   */
  private async clearDefaultFlag(): Promise<void> {
    await supabaseAdmin
      .from('email_accounts')
      .update({ is_default: false })
      .eq('is_default', true);
  }

  /**
   * Test SMTP connection for an account
   */
  async testSmtpConnection(accountId: string): Promise<{ success: boolean; error?: string }> {
    const account = await this.getWithDecryptedPasswords(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // Note: Actual SMTP testing is done in the email-sender service
    // This is just a stub that the service layer will use
    return { success: true };
  }

  /**
   * Test IMAP connection for an account
   */
  async testImapConnection(accountId: string): Promise<{ success: boolean; error?: string }> {
    const account = await this.getWithDecryptedPasswords(accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // Note: Actual IMAP testing is done in the email-poller worker
    // This is just a stub that the service layer will use
    return { success: true };
  }
}

export default new EmailAccountRepository();
