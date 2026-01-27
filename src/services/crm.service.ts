import crmCustomerRepository, {
  CrmCustomer,
  CrmContact,
  CreateCrmCustomerRequest,
  UpdateCrmCustomerRequest,
  CreateCrmContactRequest,
  CrmCustomerFilters,
  PaginationParams,
} from '../database/repositories/crm-customer.repository';
import { logger } from '../utils/logger';

// ============================================================================
// Custom Error Classes
// ============================================================================

export class CrmError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'CrmError';
  }
}

export class CustomerNotFoundError extends CrmError {
  constructor(identifier: string) {
    super(`Customer not found: ${identifier}`, 404);
    this.name = 'CustomerNotFoundError';
  }
}

export class DuplicateCustomerError extends CrmError {
  constructor(field: string, value: string) {
    super(`Customer with ${field} '${value}' already exists`, 409);
    this.name = 'DuplicateCustomerError';
  }
}

// ============================================================================
// Service Class
// ============================================================================

export class CrmService {
  /**
   * Get all customers with filters
   */
  async getCustomers(filters: CrmCustomerFilters = {}, pagination: PaginationParams = {}) {
    try {
      return await crmCustomerRepository.findAll(filters, pagination);
    } catch (error: any) {
      logger.error('Failed to get customers', { error: error.message });
      throw new CrmError(`Failed to retrieve customers: ${error.message}`, 500);
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(id: string): Promise<CrmCustomer> {
    try {
      const customer = await crmCustomerRepository.findById(id);

      if (!customer) {
        throw new CustomerNotFoundError(id);
      }

      return customer;
    } catch (error: any) {
      if (error instanceof CustomerNotFoundError) throw error;

      logger.error('Failed to get customer by ID', { id, error: error.message });
      throw new CrmError(`Failed to retrieve customer: ${error.message}`, 500);
    }
  }

  /**
   * Get customer by customer code
   */
  async getCustomerByCode(customerCode: string): Promise<CrmCustomer> {
    try {
      const customer = await crmCustomerRepository.findByCustomerCode(customerCode);

      if (!customer) {
        throw new CustomerNotFoundError(customerCode);
      }

      return customer;
    } catch (error: any) {
      if (error instanceof CustomerNotFoundError) throw error;

      logger.error('Failed to get customer by code', { customerCode, error: error.message });
      throw new CrmError(`Failed to retrieve customer: ${error.message}`, 500);
    }
  }

  /**
   * Create new customer with deduplication
   */
  async createCustomer(data: CreateCrmCustomerRequest): Promise<CrmCustomer> {
    try {
      // Validation
      this.validateCustomerData(data);

      // Check for duplicates
      await this.checkDuplicates(data);

      const customer = await crmCustomerRepository.create(data);

      logger.info('CRM customer created', {
        id: customer.id,
        customer_code: customer.customer_code,
        legal_name: customer.legal_name,
      });

      return customer;
    } catch (error: any) {
      if (error instanceof CrmError) throw error;

      logger.error('Failed to create customer', { error: error.message });
      throw new CrmError(`Failed to create customer: ${error.message}`, 500);
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(id: string, updates: UpdateCrmCustomerRequest): Promise<CrmCustomer> {
    try {
      // Verify customer exists
      await this.getCustomerById(id);

      // Check for duplicates if email or GST is being updated
      if (updates.primary_email || updates.gst_number) {
        const existing = await this.getCustomerById(id);

        if (updates.primary_email && updates.primary_email !== existing.primary_email) {
          const duplicate = await crmCustomerRepository.findByEmail(updates.primary_email);
          if (duplicate && duplicate.id !== id) {
            throw new DuplicateCustomerError('email', updates.primary_email);
          }
        }

        if (updates.gst_number && updates.gst_number !== existing.gst_number) {
          const duplicate = await crmCustomerRepository.findByGstNumber(updates.gst_number);
          if (duplicate && duplicate.id !== id) {
            throw new DuplicateCustomerError('GST number', updates.gst_number);
          }
        }
      }

      const customer = await crmCustomerRepository.update(id, updates);

      logger.info('CRM customer updated', { id, status: customer.status });

      return customer;
    } catch (error: any) {
      if (error instanceof CrmError) throw error;

      logger.error('Failed to update customer', { id, error: error.message });
      throw new CrmError(`Failed to update customer: ${error.message}`, 500);
    }
  }

  /**
   * Convert lead to customer
   */
  async convertLeadToCustomer(id: string, userId?: string): Promise<CrmCustomer> {
    try {
      const customer = await this.getCustomerById(id);

      if (customer.status !== 'LEAD' && customer.status !== 'QUALIFIED') {
        throw new CrmError('Only leads can be converted to customers');
      }

      const converted = await crmCustomerRepository.convertLeadToCustomer(id, userId);

      logger.info('Lead converted to customer', {
        id,
        customer_code: converted.customer_code,
        legal_name: converted.legal_name,
      });

      return converted;
    } catch (error: any) {
      if (error instanceof CrmError) throw error;

      logger.error('Failed to convert lead', { id, error: error.message });
      throw new CrmError(`Failed to convert lead: ${error.message}`, 500);
    }
  }

  /**
   * Delete customer
   */
  async deleteCustomer(id: string): Promise<void> {
    try {
      await this.getCustomerById(id);
      await crmCustomerRepository.delete(id);

      logger.info('CRM customer deleted', { id });
    } catch (error: any) {
      if (error instanceof CrmError) throw error;

      logger.error('Failed to delete customer', { id, error: error.message });
      throw new CrmError(`Failed to delete customer: ${error.message}`, 500);
    }
  }

  /**
   * Get contacts for customer
   */
  async getCustomerContacts(customerId: string): Promise<CrmContact[]> {
    try {
      // Verify customer exists
      await this.getCustomerById(customerId);

      return await crmCustomerRepository.getContacts(customerId);
    } catch (error: any) {
      if (error instanceof CrmError) throw error;

      logger.error('Failed to get customer contacts', { customerId, error: error.message });
      throw new CrmError(`Failed to retrieve contacts: ${error.message}`, 500);
    }
  }

  /**
   * Create contact for customer
   */
  async createContact(data: CreateCrmContactRequest): Promise<CrmContact> {
    try {
      // Verify customer exists
      await this.getCustomerById(data.customer_id);

      // Validation
      if (!data.full_name || data.full_name.trim().length === 0) {
        throw new CrmError('Contact name is required');
      }

      if (data.email && !this.isValidEmail(data.email)) {
        throw new CrmError('Invalid email format');
      }

      const contact = await crmCustomerRepository.createContact(data);

      logger.info('CRM contact created', {
        id: contact.id,
        customer_id: contact.customer_id,
        full_name: contact.full_name,
      });

      return contact;
    } catch (error: any) {
      if (error instanceof CrmError) throw error;

      logger.error('Failed to create contact', { error: error.message });
      throw new CrmError(`Failed to create contact: ${error.message}`, 500);
    }
  }

  /**
   * Get customers with pending KYC
   */
  async getPendingKycCustomers(): Promise<CrmCustomer[]> {
    try {
      return await crmCustomerRepository.getPendingKyc();
    } catch (error: any) {
      logger.error('Failed to get pending KYC customers', { error: error.message });
      throw new CrmError(`Failed to retrieve pending KYC customers: ${error.message}`, 500);
    }
  }

  /**
   * Get all contacts across all customers
   */
  async getAllContacts(): Promise<CrmContact[]> {
    try {
      return await crmCustomerRepository.getAllContacts();
    } catch (error: any) {
      logger.error('Failed to get all contacts', { error: error.message });
      throw new CrmError(`Failed to retrieve contacts: ${error.message}`, 500);
    }
  }

  // ============================================================================
  // Validation & Helper Methods
  // ============================================================================

  /**
   * Validate customer data
   */
  private validateCustomerData(data: CreateCrmCustomerRequest): void {
    if (!data.legal_name || data.legal_name.trim().length === 0) {
      throw new CrmError('Legal name is required');
    }

    if (data.primary_email && !this.isValidEmail(data.primary_email)) {
      throw new CrmError('Invalid email format');
    }

    if (data.gst_number && !this.isValidGstNumber(data.gst_number)) {
      throw new CrmError('Invalid GST number format (must be 15 characters)');
    }

    if (data.pan_number && !this.isValidPanNumber(data.pan_number)) {
      throw new CrmError('Invalid PAN number format (must be 10 characters)');
    }
  }

  /**
   * Check for duplicate customers
   */
  private async checkDuplicates(data: CreateCrmCustomerRequest): Promise<void> {
    // Check email
    if (data.primary_email) {
      const existing = await crmCustomerRepository.findByEmail(data.primary_email);
      if (existing) {
        throw new DuplicateCustomerError('email', data.primary_email);
      }
    }

    // Check GST number
    if (data.gst_number) {
      const existing = await crmCustomerRepository.findByGstNumber(data.gst_number);
      if (existing) {
        throw new DuplicateCustomerError('GST number', data.gst_number);
      }
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate Indian GST number format
   */
  private isValidGstNumber(gst: string): boolean {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gst);
  }

  /**
   * Validate Indian PAN number format
   */
  private isValidPanNumber(pan: string): boolean {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
  }
}

export default new CrmService();
