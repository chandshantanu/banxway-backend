/**
 * CRM Sync Service
 *
 * Handles bidirectional synchronization between Banxway CRM and EspoCRM.
 *
 * Features:
 * - Sync users to EspoCRM as Users
 * - Sync customers to EspoCRM as Accounts
 * - Sync contacts to EspoCRM as Contacts
 * - Sync quotations to EspoCRM as Opportunities
 * - Handle webhooks from EspoCRM for updates
 * - Conflict resolution
 * - Sync logging and error tracking
 *
 * @example
 * ```typescript
 * // Sync user to EspoCRM
 * await crmSyncService.syncUserToEspo(userId);
 *
 * // Sync customer to EspoCRM
 * await crmSyncService.syncCustomerToEspo(customerId);
 *
 * // Handle EspoCRM webhook
 * await crmSyncService.handleEspoWebhook(webhookData);
 * ```
 */

import axios, { AxiosInstance } from 'axios';
import { supabase } from '../config/database.config';
import { logger } from '../utils/logger';
import crmCustomerRepository from '../database/repositories/crm-customer.repository';
import quotationRepository from '../database/repositories/quotation.repository';
import type { CrmCustomer } from '../database/repositories/crm-customer.repository';
import type { Quotation } from '../database/repositories/quotation.repository';

// EspoCRM configuration
const ESPOCRM_API_URL = process.env.ESPOCRM_API_URL || 'http://localhost:8080/api/v1';
const ESPOCRM_API_KEY = process.env.ESPOCRM_API_KEY || '';
const ESPOCRM_ENABLED = process.env.ESPOCRM_ENABLED === 'true';

// Sync status type
type SyncStatus = 'success' | 'failed' | 'skipped';

interface SyncLog {
  entity_type: string;
  entity_id: string;
  espocrm_id: string | null;
  sync_direction: 'to_espocrm' | 'from_espocrm';
  status: SyncStatus;
  error_message: string | null;
  synced_at: string;
}

/**
 * CRM Sync Service
 */
class CrmSyncService {
  private client: AxiosInstance;

  constructor() {
    // Initialize EspoCRM API client
    this.client = axios.create({
      baseURL: ESPOCRM_API_URL,
      headers: {
        'X-Api-Key': ESPOCRM_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Check if EspoCRM sync is enabled
   */
  isEnabled(): boolean {
    return ESPOCRM_ENABLED && !!ESPOCRM_API_KEY;
  }

  /**
   * Sync Banxway user to EspoCRM as User
   * CRITICAL: Users must exist in EspoCRM for proper authentication and data ownership
   */
  async syncUserToEspo(userId: string): Promise<void> {
    if (!this.isEnabled()) {
      logger.debug('EspoCRM sync disabled, skipping user sync', { userId });
      return;
    }

    try {
      // Fetch user from Supabase Auth
      const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);

      if (error || !user) {
        throw new Error(`User not found: ${userId}`);
      }

      logger.info('Syncing user to EspoCRM', {
        userId,
        email: user.email,
      });

      // Map user to EspoCRM User format
      const espoUser = {
        userName: user.email?.split('@')[0] || `user_${userId.substring(0, 8)}`,
        firstName: user.user_metadata?.name?.split(' ')[0] || 'User',
        lastName: user.user_metadata?.name?.split(' ').slice(1).join(' ') || user.email?.split('@')[0] || 'Unknown',
        emailAddress: user.email,
        isActive: true,
        type: 'regular', // or 'portal' for customer portal users
        defaultTeamId: null, // Assign to team if needed
        banxwayUserId: userId, // Custom field to link back to Banxway
      };

      let espoUserId: string;

      // Check if user already exists in EspoCRM
      const { data: users } = await supabase
        .from('users')
        .select('espocrm_user_id')
        .eq('id', userId)
        .single();

      if (users?.espocrm_user_id) {
        // Update existing user
        logger.debug('Updating existing EspoCRM user', { espoUserId: users.espocrm_user_id });
        await this.client.put(`/User/${users.espocrm_user_id}`, espoUser);
        espoUserId = users.espocrm_user_id;
      } else {
        // Create new user
        logger.debug('Creating new EspoCRM user', { userName: espoUser.userName });
        const response = await this.client.post('/User', espoUser);
        espoUserId = response.data.id;

        // Store EspoCRM user ID in Banxway
        await supabase
          .from('users')
          .update({ espocrm_user_id: espoUserId })
          .eq('id', userId);
      }

      // Log sync success
      await this.logSync({
        entity_type: 'user',
        entity_id: userId,
        espocrm_id: espoUserId,
        sync_direction: 'to_espocrm',
        status: 'success',
        error_message: null,
        synced_at: new Date().toISOString(),
      });

      logger.info('User synced successfully to EspoCRM', {
        userId,
        espoUserId,
      });
    } catch (error: any) {
      logger.error('Failed to sync user to EspoCRM', {
        userId,
        error: error.message,
      });

      // Log sync failure
      await this.logSync({
        entity_type: 'user',
        entity_id: userId,
        espocrm_id: null,
        sync_direction: 'to_espocrm',
        status: 'failed',
        error_message: error.message,
        synced_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Sync customer to EspoCRM as Account
   */
  async syncCustomerToEspo(customerId: string): Promise<void> {
    if (!this.isEnabled()) {
      logger.debug('EspoCRM sync disabled, skipping customer sync', { customerId });
      return;
    }

    try {
      // Fetch customer
      const customer = await crmCustomerRepository.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      logger.info('Syncing customer to EspoCRM', {
        customerId,
        customerCode: customer.customer_code,
      });

      // Map customer to EspoCRM Account
      const espoAccount = this.mapCustomerToEspoAccount(customer);

      let espoAccountId: string;

      if (customer.espocrm_account_id) {
        // Update existing account
        await this.client.put(`/Account/${customer.espocrm_account_id}`, espoAccount);
        espoAccountId = customer.espocrm_account_id;

        logger.info('Updated EspoCRM account', {
          customerId,
          espoAccountId,
        });
      } else {
        // Create new account
        const response = await this.client.post('/Account', espoAccount);
        espoAccountId = response.data.id;

        // Store EspoCRM ID in customer record
        await crmCustomerRepository.update(customerId, {
          espocrm_account_id: espoAccountId,
        });

        logger.info('Created EspoCRM account', {
          customerId,
          espoAccountId,
        });
      }

      // Log sync
      await this.logSync({
        entity_type: 'customer',
        entity_id: customerId,
        espocrm_id: espoAccountId,
        sync_direction: 'to_espocrm',
        status: 'success',
        error_message: null,
        synced_at: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to sync customer to EspoCRM', {
        customerId,
        error: error.message,
      });

      await this.logSync({
        entity_type: 'customer',
        entity_id: customerId,
        espocrm_id: null,
        sync_direction: 'to_espocrm',
        status: 'failed',
        error_message: error.message,
        synced_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Sync contact to EspoCRM
   */
  async syncContactToEspo(contactId: string): Promise<void> {
    if (!this.isEnabled()) {
      logger.debug('EspoCRM sync disabled, skipping contact sync', { contactId });
      return;
    }

    try {
      // Fetch contact
      const { data: contact, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (error || !contact) {
        throw new Error('Contact not found');
      }

      logger.info('Syncing contact to EspoCRM', { contactId });

      // Fetch customer to get EspoCRM account ID
      const customer = await crmCustomerRepository.findById(contact.customer_id);
      if (!customer?.espocrm_account_id) {
        throw new Error('Customer not synced to EspoCRM yet');
      }

      // Map contact to EspoCRM Contact
      const espoContact = {
        firstName: contact.full_name.split(' ')[0] || '',
        lastName: contact.full_name.split(' ').slice(1).join(' ') || contact.full_name,
        accountId: customer.espocrm_account_id,
        emailAddress: contact.email || '',
        phoneNumber: contact.phone || '',
        title: contact.designation || '',
        department: contact.department || '',
      };

      let espoContactId: string;

      if (contact.espocrm_contact_id) {
        // Update existing contact
        await this.client.put(`/Contact/${contact.espocrm_contact_id}`, espoContact);
        espoContactId = contact.espocrm_contact_id;
      } else {
        // Create new contact
        const response = await this.client.post('/Contact', espoContact);
        espoContactId = response.data.id;

        // Store EspoCRM ID
        await supabase
          .from('crm_contacts')
          .update({ espocrm_contact_id: espoContactId })
          .eq('id', contactId);
      }

      logger.info('Synced contact to EspoCRM', { contactId, espoContactId });

      await this.logSync({
        entity_type: 'contact',
        entity_id: contactId,
        espocrm_id: espoContactId,
        sync_direction: 'to_espocrm',
        status: 'success',
        error_message: null,
        synced_at: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to sync contact to EspoCRM', {
        contactId,
        error: error.message,
      });

      await this.logSync({
        entity_type: 'contact',
        entity_id: contactId,
        espocrm_id: null,
        sync_direction: 'to_espocrm',
        status: 'failed',
        error_message: error.message,
        synced_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Sync quotation to EspoCRM as Opportunity
   */
  async syncQuotationToEspo(quotationId: string): Promise<void> {
    if (!this.isEnabled()) {
      logger.debug('EspoCRM sync disabled, skipping quotation sync', { quotationId });
      return;
    }

    try {
      // Fetch quotation
      const quotation = await quotationRepository.findById(quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      logger.info('Syncing quotation to EspoCRM', { quotationId });

      // Fetch customer to get EspoCRM account ID
      const customer = await crmCustomerRepository.findById(quotation.customer_id);
      if (!customer?.espocrm_account_id) {
        throw new Error('Customer not synced to EspoCRM yet');
      }

      // Map quotation to EspoCRM Opportunity
      const espoOpportunity = {
        name: `${quotation.quote_number} - ${quotation.customer_name}`,
        accountId: customer.espocrm_account_id,
        amount: quotation.total_cost,
        closeDate: quotation.valid_until,
        stage: this.mapQuotationStatusToEspoStage(quotation.status),
        description: quotation.notes || '',
        // Custom fields
        shipmentType: quotation.shipment_type,
        originLocation: quotation.origin_location || '',
        destinationLocation: quotation.destination_location || '',
        quoteNumber: quotation.quote_number,
      };

      // Create or update opportunity (quotations don't typically update, so just create)
      const response = await this.client.post('/Opportunity', espoOpportunity);
      const espoOpportunityId = response.data.id;

      logger.info('Synced quotation to EspoCRM', { quotationId, espoOpportunityId });

      await this.logSync({
        entity_type: 'quotation',
        entity_id: quotationId,
        espocrm_id: espoOpportunityId,
        sync_direction: 'to_espocrm',
        status: 'success',
        error_message: null,
        synced_at: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to sync quotation to EspoCRM', {
        quotationId,
        error: error.message,
      });

      await this.logSync({
        entity_type: 'quotation',
        entity_id: quotationId,
        espocrm_id: null,
        sync_direction: 'to_espocrm',
        status: 'failed',
        error_message: error.message,
        synced_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Handle EspoCRM webhook for Account updates
   */
  async handleEspoAccountWebhook(webhookData: any): Promise<void> {
    try {
      const { id: espoAccountId, name, emailAddress, phoneNumber, industry } = webhookData;

      logger.info('Received EspoCRM account webhook', { espoAccountId });

      // Find customer by EspoCRM ID
      const { data: customers, error } = await supabase
        .from('crm_customers')
        .select('*')
        .eq('espocrm_account_id', espoAccountId)
        .limit(1);

      if (error || !customers || customers.length === 0) {
        logger.warn('Customer not found for EspoCRM account', { espoAccountId });
        return;
      }

      const customer = customers[0];

      // Update customer with EspoCRM data
      await crmCustomerRepository.update(customer.id, {
        legal_name: name || customer.legal_name,
        primary_email: emailAddress || customer.primary_email,
        primary_phone: phoneNumber || customer.primary_phone,
        industry: industry || customer.industry,
      });

      logger.info('Updated customer from EspoCRM webhook', {
        customerId: customer.id,
        espoAccountId,
      });

      await this.logSync({
        entity_type: 'customer',
        entity_id: customer.id,
        espocrm_id: espoAccountId,
        sync_direction: 'from_espocrm',
        status: 'success',
        error_message: null,
        synced_at: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to handle EspoCRM account webhook', {
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Map customer to EspoCRM Account
   */
  private mapCustomerToEspoAccount(customer: CrmCustomer): any {
    return {
      name: customer.legal_name,
      emailAddress: customer.primary_email || '',
      phoneNumber: customer.primary_phone || '',
      website: customer.website || '',
      industry: customer.industry || '',
      type: customer.status === 'LEAD' ? 'Prospect' : 'Customer',
      // Custom fields
      customerCode: customer.customer_code,
      gstNumber: customer.gst_number || '',
      panNumber: customer.pan_number || '',
      iecNumber: customer.iec_number || '',
      customerTier: customer.customer_tier,
      creditTerms: customer.credit_terms,
      creditLimit: customer.credit_limit_usd || 0,
      outstandingBalance: customer.outstanding_balance_usd || 0,
    };
  }

  /**
   * Map quotation status to EspoCRM Opportunity stage
   */
  private mapQuotationStatusToEspoStage(status: string): string {
    const stageMap: Record<string, string> = {
      DRAFT: 'Prospecting',
      SENT: 'Qualification',
      ACCEPTED: 'Negotiation',
      REJECTED: 'Closed Lost',
      EXPIRED: 'Closed Lost',
      CONVERTED: 'Closed Won',
    };

    return stageMap[status] || 'Prospecting';
  }

  /**
   * Log sync operation
   */
  private async logSync(log: SyncLog): Promise<void> {
    try {
      await supabase.from('crm_sync_logs').insert(log);
    } catch (error: any) {
      logger.error('Failed to log CRM sync', { error: error.message });
    }
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(): Promise<{
    total: number;
    success: number;
    failed: number;
    lastSync: string | null;
  }> {
    try {
      const { data, error } = await supabase
        .from('crm_sync_logs')
        .select('status, synced_at')
        .order('synced_at', { ascending: false });

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        success: data?.filter((log) => log.status === 'success').length || 0,
        failed: data?.filter((log) => log.status === 'failed').length || 0,
        lastSync: data && data.length > 0 ? data[0].synced_at : null,
      };

      return stats;
    } catch (error: any) {
      logger.error('Failed to get sync stats', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
export const crmSyncService = new CrmSyncService();
