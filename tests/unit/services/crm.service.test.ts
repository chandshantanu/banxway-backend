/**
 * CRM Service Unit Tests
 *
 * Tests for CRM business logic layer with mock repository.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CrmService, CrmError, CustomerNotFoundError, DuplicateCustomerError } from '../../../src/services/crm.service';
import { CrmCustomer, CreateCrmCustomerRequest } from '../../../src/database/repositories/crm-customer.repository';

// Mock the repository
const mockCrmRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCustomerCode: jest.fn(),
  findByEmail: jest.fn(),
  findByGstNumber: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  convertLeadToCustomer: jest.fn(),
  getContacts: jest.fn(),
  createContact: jest.fn(),
  getAllContacts: jest.fn(),
  getPendingKyc: jest.fn(),
};

jest.mock('../../../src/database/repositories/crm-customer.repository', () => ({
  __esModule: true,
  default: mockCrmRepository,
}));

describe('CrmService', () => {
  let crmService;

  beforeEach(() => {
    jest.clearAllMocks();
    crmService = new CrmService();
  });

  describe('getCustomers', () => {
    it('should return paginated customers with filters', async () => {
      const mockCustomers = [
        {
          id: '1',
          customer_code: 'CUST001',
          legal_name: 'Acme Corporation',
          status: 'ACTIVE',
          customer_tier: 'TIER1',
        },
        {
          id: '2',
          customer_code: 'CUST002',
          legal_name: 'Global Imports',
          status: 'ACTIVE',
          customer_tier: 'TIER2',
        },
      ];

      mockCrmRepository.findAll.mockResolvedValue({
        data: mockCustomers,
        total: 2,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });

      const result = await crmService.getCustomers({ status: 'ACTIVE' }, { page: 1, limit: 50 });

      expect(result.data).toEqual(mockCustomers);
      expect(result.total).toBe(2);
      expect(mockCrmRepository.findAll).toHaveBeenCalledWith(
        { status: 'ACTIVE' },
        { page: 1, limit: 50 }
      );
    });

    it('should handle empty results', async () => {
      mockCrmRepository.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
      });

      const result = await crmService.getCustomers({}, {});

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should throw CrmError on repository failure', async () => {
      mockCrmRepository.findAll.mockRejectedValue(new Error('Database error'));

      await expect(crmService.getCustomers({}, {})).rejects.toThrow(CrmError);
    });
  });

  describe('getCustomerById', () => {
    it('should return customer when found', async () => {
      const mockCustomer: CrmCustomer = {
        id: '1',
        customer_code: 'CUST001',
        legal_name: 'Acme Corporation',
        trading_name: 'Acme Inc',
        primary_email: 'contact@acme.com',
        primary_phone: '+91-9876543210',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'NET_30',
        kyc_status: 'VERIFIED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockCrmRepository.findById.mockResolvedValue(mockCustomer);

      const result = await crmService.getCustomerById('1');

      expect(result).toEqual(mockCustomer);
      expect(mockCrmRepository.findById).toHaveBeenCalledWith('1');
    });

    it('should throw CustomerNotFoundError when customer does not exist', async () => {
      mockCrmRepository.findById.mockResolvedValue(null);

      await expect(crmService.getCustomerById('999')).rejects.toThrow(CustomerNotFoundError);
    });
  });

  describe('createCustomer', () => {
    const validCustomerData: CreateCrmCustomerRequest = {
      legal_name: 'Acme Corporation',
      primary_email: 'contact@acme.com',
      status: 'ACTIVE',
      customer_tier: 'TIER1',
      credit_terms: 'NET_30',
    };

    it('should create customer with valid data', async () => {
      const mockCreatedCustomer: CrmCustomer = {
        id: '1',
        customer_code: 'CUST001',
        ...validCustomerData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock no duplicates
      mockCrmRepository.findByEmail.mockResolvedValue(null);
      mockCrmRepository.findByGstNumber.mockResolvedValue(null);
      mockCrmRepository.create.mockResolvedValue(mockCreatedCustomer);

      const result = await crmService.createCustomer(validCustomerData);

      expect(result).toEqual(mockCreatedCustomer);
      expect(mockCrmRepository.create).toHaveBeenCalledWith(validCustomerData);
    });

    it('should throw CrmError when legal name is missing', async () => {
      const invalidData = { ...validCustomerData, legal_name: '' };

      await expect(crmService.createCustomer(invalidData)).rejects.toThrow(CrmError);
      expect(mockCrmRepository.create).not.toHaveBeenCalled();
    });

    it('should throw CrmError for invalid email format', async () => {
      const invalidData = { ...validCustomerData, primary_email: 'invalid-email' };

      await expect(crmService.createCustomer(invalidData)).rejects.toThrow(CrmError);
      expect(mockCrmRepository.create).not.toHaveBeenCalled();
    });

    it('should throw DuplicateCustomerError when email already exists', async () => {
      const existingCustomer: CrmCustomer = {
        id: '999',
        customer_code: 'CUST999',
        legal_name: 'Existing Corp',
        primary_email: 'contact@acme.com',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'ADVANCE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockCrmRepository.findByEmail.mockResolvedValue(existingCustomer);

      await expect(crmService.createCustomer(validCustomerData)).rejects.toThrow(DuplicateCustomerError);
      expect(mockCrmRepository.create).not.toHaveBeenCalled();
    });

    it('should throw DuplicateCustomerError when GST number already exists', async () => {
      const dataWithGst = { ...validCustomerData, gst_number: '29AABCT1332L1ZV' };
      const existingCustomer: CrmCustomer = {
        id: '999',
        customer_code: 'CUST999',
        legal_name: 'Existing Corp',
        gst_number: '29AABCT1332L1ZV',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'ADVANCE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockCrmRepository.findByEmail.mockResolvedValue(null);
      mockCrmRepository.findByGstNumber.mockResolvedValue(existingCustomer);

      await expect(crmService.createCustomer(dataWithGst)).rejects.toThrow(DuplicateCustomerError);
      expect(mockCrmRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCustomer', () => {
    const existingCustomer: CrmCustomer = {
      id: '1',
      customer_code: 'CUST001',
      legal_name: 'Acme Corporation',
      primary_email: 'contact@acme.com',
      status: 'ACTIVE',
      customer_tier: 'TIER1',
      credit_terms: 'NET_30',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('should update customer successfully', async () => {
      const updates = { status: 'INACTIVE' as any };
      const updatedCustomer = { ...existingCustomer, ...updates };

      mockCrmRepository.findById.mockResolvedValue(existingCustomer);
      mockCrmRepository.update.mockResolvedValue(updatedCustomer);

      const result = await crmService.updateCustomer('1', updates);

      expect(result).toEqual(updatedCustomer);
      expect(mockCrmRepository.update).toHaveBeenCalledWith('1', updates);
    });

    it('should throw CustomerNotFoundError when customer does not exist', async () => {
      mockCrmRepository.findById.mockResolvedValue(null);

      await expect(crmService.updateCustomer('999', { status: 'INACTIVE' as any })).rejects.toThrow(
        CustomerNotFoundError
      );
      expect(mockCrmRepository.update).not.toHaveBeenCalled();
    });

    it('should check for duplicate email when updating email', async () => {
      const updates = { primary_email: 'newemail@example.com' };
      const duplicateCustomer: CrmCustomer = {
        id: '2',
        customer_code: 'CUST002',
        legal_name: 'Another Corp',
        primary_email: 'newemail@example.com',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'ADVANCE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockCrmRepository.findById.mockResolvedValue(existingCustomer);
      mockCrmRepository.findByEmail.mockResolvedValue(duplicateCustomer);

      await expect(crmService.updateCustomer('1', updates)).rejects.toThrow(DuplicateCustomerError);
      expect(mockCrmRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('convertLeadToCustomer', () => {
    const leadCustomer: CrmCustomer = {
      id: '1',
      customer_code: 'LEAD001',
      legal_name: 'Potential Corp',
      status: 'LEAD',
      customer_tier: 'NEW',
      credit_terms: 'ADVANCE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('should convert lead to customer', async () => {
      const convertedCustomer = { ...leadCustomer, status: 'ACTIVE' as any, customer_code: 'CUST001' };

      mockCrmRepository.findById.mockResolvedValue(leadCustomer);
      mockCrmRepository.convertLeadToCustomer.mockResolvedValue(convertedCustomer);

      const result = await crmService.convertLeadToCustomer('1', 'user-123');

      expect(result).toEqual(convertedCustomer);
      expect(mockCrmRepository.convertLeadToCustomer).toHaveBeenCalledWith('1', 'user-123');
    });

    it('should throw CrmError when customer is not a lead', async () => {
      const activeCustomer = { ...leadCustomer, status: 'ACTIVE' as any };

      mockCrmRepository.findById.mockResolvedValue(activeCustomer);

      await expect(crmService.convertLeadToCustomer('1')).rejects.toThrow(CrmError);
      expect(mockCrmRepository.convertLeadToCustomer).not.toHaveBeenCalled();
    });
  });

  describe('deleteCustomer', () => {
    it('should delete customer successfully', async () => {
      const mockCustomer: CrmCustomer = {
        id: '1',
        customer_code: 'CUST001',
        legal_name: 'Acme Corporation',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'NET_30',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockCrmRepository.findById.mockResolvedValue(mockCustomer);
      mockCrmRepository.delete.mockResolvedValue(undefined);

      await crmService.deleteCustomer('1');

      expect(mockCrmRepository.delete).toHaveBeenCalledWith('1');
    });

    it('should throw CustomerNotFoundError when customer does not exist', async () => {
      mockCrmRepository.findById.mockResolvedValue(null);

      await expect(crmService.deleteCustomer('999')).rejects.toThrow(CustomerNotFoundError);
      expect(mockCrmRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('getCustomerContacts', () => {
    it('should return contacts for a customer', async () => {
      const mockCustomer: CrmCustomer = {
        id: '1',
        customer_code: 'CUST001',
        legal_name: 'Acme Corporation',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'NET_30',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockContacts = [
        {
          id: '1',
          customer_id: '1',
          full_name: 'John Smith',
          email: 'john@acme.com',
          is_primary: true,
        },
        {
          id: '2',
          customer_id: '1',
          full_name: 'Jane Doe',
          email: 'jane@acme.com',
          is_primary: false,
        },
      ];

      mockCrmRepository.findById.mockResolvedValue(mockCustomer);
      mockCrmRepository.getContacts.mockResolvedValue(mockContacts);

      const result = await crmService.getCustomerContacts('1');

      expect(result).toEqual(mockContacts);
      expect(mockCrmRepository.getContacts).toHaveBeenCalledWith('1');
    });

    it('should throw CustomerNotFoundError when customer does not exist', async () => {
      mockCrmRepository.findById.mockResolvedValue(null);

      await expect(crmService.getCustomerContacts('999')).rejects.toThrow(CustomerNotFoundError);
      expect(mockCrmRepository.getContacts).not.toHaveBeenCalled();
    });
  });

  describe('createContact', () => {
    const mockCustomer: CrmCustomer = {
      id: '1',
      customer_code: 'CUST001',
      legal_name: 'Acme Corporation',
      status: 'ACTIVE',
      customer_tier: 'TIER1',
      credit_terms: 'NET_30',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('should create contact with valid data', async () => {
      const contactData = {
        customer_id: '1',
        full_name: 'John Smith',
        email: 'john@acme.com',
        is_primary: true,
      };

      const mockCreatedContact = {
        id: '1',
        ...contactData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockCrmRepository.findById.mockResolvedValue(mockCustomer);
      mockCrmRepository.createContact.mockResolvedValue(mockCreatedContact);

      const result = await crmService.createContact(contactData);

      expect(result).toEqual(mockCreatedContact);
      expect(mockCrmRepository.createContact).toHaveBeenCalledWith(contactData);
    });

    it('should throw CrmError when contact name is missing', async () => {
      const invalidData = {
        customer_id: '1',
        full_name: '',
        email: 'john@acme.com',
      };

      mockCrmRepository.findById.mockResolvedValue(mockCustomer);

      await expect(crmService.createContact(invalidData)).rejects.toThrow(CrmError);
      expect(mockCrmRepository.createContact).not.toHaveBeenCalled();
    });

    it('should throw CrmError for invalid email', async () => {
      const invalidData = {
        customer_id: '1',
        full_name: 'John Smith',
        email: 'invalid-email',
      };

      mockCrmRepository.findById.mockResolvedValue(mockCustomer);

      await expect(crmService.createContact(invalidData)).rejects.toThrow(CrmError);
      expect(mockCrmRepository.createContact).not.toHaveBeenCalled();
    });

    it('should throw CustomerNotFoundError when customer does not exist', async () => {
      const contactData = {
        customer_id: '999',
        full_name: 'John Smith',
        email: 'john@acme.com',
      };

      mockCrmRepository.findById.mockResolvedValue(null);

      await expect(crmService.createContact(contactData)).rejects.toThrow(CustomerNotFoundError);
      expect(mockCrmRepository.createContact).not.toHaveBeenCalled();
    });
  });
});
