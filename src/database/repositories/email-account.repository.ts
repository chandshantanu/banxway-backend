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
      logger.error('Error fetching default account', { error: error.message });
      throw error;
    }

    return data as EmailAccount;
  }

  /**
   * Get decrypted password for an account
   */
  async getDecryptedPassword(accountId: string, type: 'smtp' | 'imap'): Promise<string> {
    const column = type === 'smtp' ? 'smtp_pass_encrypted' : 'imap_pass_encrypted';

    const { data, error } = await supabaseAdmin.rpc('decrypt_email_password', {
      encrypted: (await this.findById(accountId))?.[column],
    });

    if (error) {
      logger.error('Error decrypting password', { accountId, type, error: error.message });
      throw error;
    }

    return data as string;
  }

  /**
   * Get account with decrypted passwords (for polling/sending)
   */
  async getWithDecryptedPasswords(accountId: string): Promise<EmailAccountDecrypted | null> {
    const account = await this.findById(accountId);
    if (!account) return null;

    // Decrypt passwords using PostgreSQL function
    const [smtpResult, imapResult] = await Promise.all([
      supabaseAdmin.rpc('decrypt_email_password', { encrypted: account.smtp_pass_encrypted }),
      supabaseAdmin.rpc('decrypt_email_password', { encrypted: account.imap_pass_encrypted }),
    ]);

    if (smtpResult.error || imapResult.error) {
      logger.error('Error decrypting passwords', {
        accountId,
        smtpError: smtpResult.error?.message,
        imapError: imapResult.error?.message,
      });
      throw smtpResult.error || imapResult.error;
    }

    const { smtp_pass_encrypted, imap_pass_encrypted, ...accountWithoutPasswords } = account;

    return {
      ...accountWithoutPasswords,
      smtp_password: smtpResult.data as string,
      imap_password: imapResult.data as string,
    };
  }

  /**
   * Create a new email account
   */
  async create(accountData: CreateEmailAccountRequest, userId?: string): Promise<EmailAccount> {
    // Encrypt passwords using PostgreSQL function
    const [smtpEncrypted, imapEncrypted] = await Promise.all([
      supabaseAdmin.rpc('encrypt_email_password', { password: accountData.smtp_password }),
      supabaseAdmin.rpc('encrypt_email_password', { password: accountData.imap_password }),
    ]);

    if (smtpEncrypted.error || imapEncrypted.error) {
      logger.error('Error encrypting passwords', {
        smtpError: smtpEncrypted.error?.message,
        imapError: imapEncrypted.error?.message,
      });
      throw smtpEncrypted.error || imapEncrypted.error;
    }

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
      smtp_pass_encrypted: smtpEncrypted.data,
      smtp_secure: accountData.smtp_secure || false,
      smtp_enabled: accountData.smtp_enabled !== false,
      imap_host: accountData.imap_host || 'imap.zoho.com',
      imap_port: accountData.imap_port || 993,
      imap_user: accountData.imap_user,
      imap_pass_encrypted: imapEncrypted.data,
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

    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .insert(newAccount)
      .select()
      .single();

    if (error) {
      logger.error('Error creating email account', { error: error.message });
      throw error;
    }

    logger.info('Email account created', { id: data.id, email: data.email });
    return data as EmailAccount;
  }

  /**
   * Update an email account
   */
  async update(id: string, updates: UpdateEmailAccountRequest): Promise<EmailAccount> {
    const updateData: any = { ...updates };

    // Handle password updates
    if (updates.smtp_password) {
      const result = await supabaseAdmin.rpc('encrypt_email_password', { password: updates.smtp_password });
      if (result.error) throw result.error;
      updateData.smtp_pass_encrypted = result.data;
      delete updateData.smtp_password;
    }

    if (updates.imap_password) {
      const result = await supabaseAdmin.rpc('encrypt_email_password', { password: updates.imap_password });
      if (result.error) throw result.error;
      updateData.imap_pass_encrypted = result.data;
      delete updateData.imap_password;
    }

    // Handle default flag
    if (updates.is_default) {
      await this.clearDefaultFlag();
    }

    const { data, error } = await supabaseAdmin
      .from('email_accounts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating email account', { id, error: error.message });
      throw error;
    }

    logger.info('Email account updated', { id });
    return data as EmailAccount;
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
