/**
 * Quotation Repository Unit Tests
 *
 * Tests for quotation data access layer with graceful degradation.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import quotationRepository from '../../../src/database/repositories/quotation.repository';

// Mock Supabase
const mockSupabaseAdmin = {
  from: jest.fn(),
};

jest.mock('../../../src/database/supabase-admin', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

describe('QuotationRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return empty array when table does not exist', async () => {
      // Mock table not found error
      const mockSelect = jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: null,
          error: { code: '42P01', message: 'relation "quotations" does not exist' },
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await quotationRepository.findAll();

      expect(result).toEqual([]);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('quotations');
    });

    it('should return all quotations when table exists', async () => {
      const mockQuotations = [
        {
          id: '1',
          quote_number: 'QT-20260126-001',
          customer_name: 'ABC Corp',
          total_cost: 5000,
        },
        {
          id: '2',
          quote_number: 'QT-20260126-002',
          customer_name: 'XYZ Ltd',
          total_cost: 3000,
        },
      ];

      const mockSelect = jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: mockQuotations,
          error: null,
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await quotationRepository.findAll();

      expect(result).toEqual(mockQuotations);
      expect(result).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should return null when table does not exist', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: '42P01', message: 'relation "quotations" does not exist' },
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await quotationRepository.findById('123');

      expect(result).toBeNull();
    });

    it('should return null when quotation not found', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Not found' },
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await quotationRepository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return quotation when found', async () => {
      const mockQuotation = {
        id: '123',
        quote_number: 'QT-20260126-001',
        customer_name: 'ABC Corp',
        total_cost: 5000,
      };

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockQuotation,
            error: null,
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        select: mockSelect,
      });

      const result = await quotationRepository.findById('123');

      expect(result).toEqual(mockQuotation);
    });
  });

  describe('create', () => {
    it('should generate unique quote number', async () => {
      const mockData = {
        customer_name: 'Test Corp',
        customer_id: 'cust-123',
        shipment_type: 'AIR_IMPORT',
        total_cost: 5000,
        currency: 'USD',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: '1',
              quote_number: 'QT-20260126-001',
              ...mockData,
            },
            error: null,
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        insert: mockInsert,
      });

      const result = await quotationRepository.create(mockData);

      expect(result.quote_number).toMatch(/^QT-\d{8}-\d{3}$/);
      expect(result.customer_name).toBe('Test Corp');
    });

    it('should calculate chargeable weight when dimensions provided', async () => {
      const mockData = {
        customer_name: 'Test Corp',
        customer_id: 'cust-123',
        shipment_type: 'AIR_IMPORT',
        total_cost: 5000,
        cargo_weight_kg: 100,
        cargo_volume_cbm: 1.5, // 1.5 CBM = 250 kg volumetric weight (1.5 * 167)
      };

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: '1',
              quote_number: 'QT-20260126-001',
              ...mockData,
              chargeable_weight: 250, // Volumetric weight is higher
            },
            error: null,
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        insert: mockInsert,
      });

      const result = await quotationRepository.create(mockData);

      // Chargeable weight should be the higher of actual (100) vs volumetric (250)
      expect(result.chargeable_weight).toBe(250);
    });
  });

  describe('update', () => {
    it('should update quotation fields', async () => {
      const updates = {
        total_cost: 6000,
        notes: 'Updated quotation',
      };

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: '123',
                quote_number: 'QT-20260126-001',
                ...updates,
              },
              error: null,
            }),
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        update: mockUpdate,
      });

      const result = await quotationRepository.update('123', updates);

      expect(result.total_cost).toBe(6000);
      expect(result.notes).toBe('Updated quotation');
    });
  });

  describe('delete', () => {
    it('should delete quotation by ID', async () => {
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({
        delete: mockDelete,
      });

      await expect(quotationRepository.delete('123')).resolves.not.toThrow();

      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
