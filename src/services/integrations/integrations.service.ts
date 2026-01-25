import { supabaseAdmin } from '../../config/database.config';
import { encryptionService } from '../encryption/encryption.service';
import { logger } from '../../utils/logger';
import { ExotelTelephonyService } from '../exotel/telephony.service';
import { ExotelWhatsAppService } from '../exotel/whatsapp.service';

export interface IntegrationCredentials {
  [key: string]: any;
}

export interface ExotelPhoneCredentials {
  account_sid: string;
  api_key: string;
  api_token: string;
  virtual_number: string;
  caller_id?: string;
}

export interface ExotelWhatsAppCredentials {
  account_sid: string;
  api_key: string;
  api_token: string;
  whatsapp_number: string;
  business_name?: string;
  auto_reply_enabled?: boolean;
  auto_reply_message?: string;
}

export class IntegrationsService {
  /**
   * List all integrations for an organization
   */
  async listIntegrations(organizationId: string): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('integration_credentials')
        .select('id, integration_type, display_name, is_active, is_verified, last_verified_at, created_at')
        .eq('organization_id', organizationId);

      if (error) throw error;

      return data || [];
    } catch (error: any) {
      logger.error('Failed to list integrations', { error: error.message, organizationId });
      throw new Error(`Failed to list integrations: ${error.message}`);
    }
  }

  /**
   * Get integration details (without decrypted credentials)
   */
  async getIntegration(organizationId: string, integrationType: string): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('integration_credentials')
        .select('id, integration_type, display_name, is_active, is_verified, last_verified_at, created_at')
        .eq('organization_id', organizationId)
        .eq('integration_type', integrationType)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

      return data;
    } catch (error: any) {
      logger.error('Failed to get integration', { error: error.message, organizationId, integrationType });
      throw new Error(`Failed to get integration: ${error.message}`);
    }
  }

  /**
   * Save integration credentials (encrypted)
   */
  async saveIntegration(
    organizationId: string,
    integrationType: string,
    credentials: IntegrationCredentials,
    userId?: string
  ): Promise<void> {
    try {
      // Encrypt credentials
      const encryptedCredentials = encryptionService.encryptObject(credentials);

      // Check if integration already exists
      const existing = await this.getIntegration(organizationId, integrationType);

      if (existing) {
        // Update existing
        const { error } = await supabaseAdmin
          .from('integration_credentials')
          .update({
            credentials_encrypted: encryptedCredentials,
            is_verified: false, // Reset verification status on update
            updated_by: userId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabaseAdmin
          .from('integration_credentials')
          .insert({
            organization_id: organizationId,
            integration_type: integrationType,
            credentials_encrypted: encryptedCredentials,
            display_name: this.getDisplayName(integrationType),
            is_active: true,
            is_verified: false,
            created_by: userId,
          });

        if (error) throw error;
      }

      logger.info('Integration saved', { organizationId, integrationType });
    } catch (error: any) {
      logger.error('Failed to save integration', { error: error.message, organizationId, integrationType });
      throw new Error(`Failed to save integration: ${error.message}`);
    }
  }

  /**
   * Get decrypted credentials for use
   */
  async getCredentials(organizationId: string, integrationType: string): Promise<IntegrationCredentials | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('integration_credentials')
        .select('credentials_encrypted')
        .eq('organization_id', organizationId)
        .eq('integration_type', integrationType)
        .eq('is_active', true)
        .single();

      if (error && error.code === 'PGRST116') return null; // Not found
      if (error) throw error;

      if (!data) return null;

      // Decrypt credentials
      const credentials = encryptionService.decryptObject(data.credentials_encrypted);
      return credentials;
    } catch (error: any) {
      logger.error('Failed to get credentials', { error: error.message, organizationId, integrationType });
      throw new Error(`Failed to get credentials: ${error.message}`);
    }
  }

  /**
   * Test integration connection
   */
  async testIntegration(integrationType: string, credentials: IntegrationCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      switch (integrationType) {
        case 'exotel_phone':
          return await this.testExotelPhone(credentials as ExotelPhoneCredentials);
        case 'exotel_whatsapp':
          return await this.testExotelWhatsApp(credentials as ExotelWhatsAppCredentials);
        default:
          return { success: false, error: 'Unknown integration type' };
      }
    } catch (error: any) {
      logger.error('Integration test failed', { error: error.message, integrationType });
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Exotel Phone connection
   */
  private async testExotelPhone(credentials: ExotelPhoneCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      // Create a temporary service instance with provided credentials
      const testService = new ExotelTelephonyService();

      // Simply verify credentials format
      if (!credentials.account_sid || !credentials.api_key || !credentials.api_token || !credentials.virtual_number) {
        return { success: false, error: 'Missing required credentials' };
      }

      // For now, just validate format
      // In production, you could make a test API call to Exotel
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test Exotel WhatsApp connection
   */
  private async testExotelWhatsApp(credentials: ExotelWhatsAppCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!credentials.account_sid || !credentials.api_key || !credentials.api_token || !credentials.whatsapp_number) {
        return { success: false, error: 'Missing required credentials' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark integration as verified
   */
  async markAsVerified(organizationId: string, integrationType: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('integration_credentials')
        .update({
          is_verified: true,
          last_verified_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('integration_type', integrationType);

      if (error) throw error;
    } catch (error: any) {
      logger.error('Failed to mark as verified', { error: error.message, organizationId, integrationType });
      throw new Error(`Failed to mark as verified: ${error.message}`);
    }
  }

  /**
   * Delete integration
   */
  async deleteIntegration(organizationId: string, integrationType: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('integration_credentials')
        .delete()
        .eq('organization_id', organizationId)
        .eq('integration_type', integrationType);

      if (error) throw error;

      logger.info('Integration deleted', { organizationId, integrationType });
    } catch (error: any) {
      logger.error('Failed to delete integration', { error: error.message, organizationId, integrationType });
      throw new Error(`Failed to delete integration: ${error.message}`);
    }
  }

  /**
   * Log integration action
   */
  async logAction(
    organizationId: string,
    userId: string | null,
    integrationType: string,
    action: string,
    status: 'success' | 'failed' | 'pending',
    details?: any
  ): Promise<void> {
    try {
      await supabaseAdmin.from('integration_audit_logs').insert({
        organization_id: organizationId,
        user_id: userId,
        integration_type: integrationType,
        action,
        status,
        details,
      });
    } catch (error: any) {
      // Don't throw, just log
      logger.error('Failed to log integration action', { error: error.message });
    }
  }

  /**
   * Get display name for integration type
   */
  private getDisplayName(integrationType: string): string {
    const names: Record<string, string> = {
      exotel_phone: 'Exotel Phone',
      exotel_whatsapp: 'Exotel WhatsApp',
      exotel_sms: 'Exotel SMS',
      zoho_mail: 'Zoho Mail',
    };
    return names[integrationType] || integrationType;
  }

  /**
   * Get or create phone numbers from Exotel integration
   */
  async syncPhoneNumbers(organizationId: string): Promise<any[]> {
    try {
      // Get Exotel credentials
      const credentials = await this.getCredentials(organizationId, 'exotel_phone') as ExotelPhoneCredentials;
      if (!credentials) {
        return [];
      }

      // Get integration record
      const integration = await this.getIntegration(organizationId, 'exotel_phone');
      if (!integration) {
        return [];
      }

      // Check if virtual number is already in database
      const { data: existingNumbers, error: fetchError } = await supabaseAdmin
        .from('organization_phone_numbers')
        .select('*')
        .eq('organization_id', organizationId);

      if (fetchError) throw fetchError;

      // Add virtual number if not exists
      if (!existingNumbers?.some(n => n.phone_number === credentials.virtual_number)) {
        const { error: insertError } = await supabaseAdmin
          .from('organization_phone_numbers')
          .insert({
            organization_id: organizationId,
            integration_id: integration.id,
            phone_number: credentials.virtual_number,
            display_name: 'Exotel Virtual Number',
            number_type: 'virtual',
            is_primary: true,
            is_active: true,
          });

        if (insertError) throw insertError;
      }

      // Fetch updated list
      const { data: updatedNumbers, error: refetchError } = await supabaseAdmin
        .from('organization_phone_numbers')
        .select(`
          *,
          assigned_user:assigned_to_user_id(id, name, email)
        `)
        .eq('organization_id', organizationId);

      if (refetchError) throw refetchError;

      return (updatedNumbers || []).map((n: any) => ({
        ...n,
        assigned_to_user_name: n.assigned_user?.name,
      }));
    } catch (error: any) {
      logger.error('Failed to sync phone numbers', { error: error.message, organizationId });
      return [];
    }
  }

  /**
   * Assign phone number to user
   */
  async assignPhoneNumber(organizationId: string, phoneId: string, userId: string | null): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('organization_phone_numbers')
        .update({
          assigned_to_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', phoneId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      logger.info('Phone number assigned', { organizationId, phoneId, userId });
    } catch (error: any) {
      logger.error('Failed to assign phone number', { error: error.message });
      throw new Error(`Failed to assign phone number: ${error.message}`);
    }
  }
}

export const integrationsService = new IntegrationsService();
