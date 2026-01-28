/**
 * Customer API Integration Tests
 *
 * Tests for customer REST API endpoints with real database calls.
 * These tests verify the full request-response cycle.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import customerRoutes from '../../../../src/api/v1/customers';
import { supabaseAdmin } from '../../../../src/database/supabase-admin';

// Mock auth middleware for testing
jest.mock('../../../../src/middleware/auth.middleware', () => ({
  authenticateRequest: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-123', role: 'admin' };
    next();
  },
  requirePermission: (permission: string) => (req: any, res: any, next: any) => {
    next();
  },
}));

describe('Customer API Integration Tests', () => {
  let app: express.Application;
  let testCustomerId: string;
  let testContactId: string;

  beforeAll(() => {
    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/v1/customers', customerRoutes);
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupTestData();
  });

  async function cleanupTestData() {
    try {
      // Delete test customers (cascades to contacts)
      await supabaseAdmin
        .from('crm_customers')
        .delete()
        .like('legal_name', '%Test Customer%');
    } catch (error) {
      // Ignore errors if table doesn't exist
      console.log('Cleanup error (may be expected):', error);
    }
  }

  describe('POST /api/v1/customers', () => {
    it('should create a new customer with valid data', async () => {
      const customerData = {
        legal_name: 'Test Customer Corporation',
        trading_name: 'Test Corp',
        primary_email: 'test@testcorp.com',
        primary_phone: '+91-9876543210',
        status: 'ACTIVE',
        customer_tier: 'TIER1',
        credit_terms: 'NET_30',
      };

      const response = await request(app)
        .post('/api/v1/customers')
        .send(customerData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('customer_code');
      expect(response.body.data.legal_name).toBe(customerData.legal_name);
      expect(response.body.data.primary_email).toBe(customerData.primary_email);

      testCustomerId = response.body.data.id;
    });

    it('should return 400 for missing required fields', async () => {
      const invalidData = {
        trading_name: 'Test Corp',
        // Missing legal_name
      };

      const response = await request(app)
        .post('/api/v1/customers')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const invalidData = {
        legal_name: 'Test Customer',
        primary_email: 'invalid-email',
      };

      const response = await request(app)
        .post('/api/v1/customers')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('email');
    });

    it('should return 409 for duplicate email', async () => {
      const customerData = {
        legal_name: 'Test Customer 1',
        primary_email: 'duplicate@test.com',
      };

      // Create first customer
      await request(app).post('/api/v1/customers').send(customerData).expect(201);

      // Try to create second with same email
      const duplicateData = {
        legal_name: 'Test Customer 2',
        primary_email: 'duplicate@test.com',
      };

      const response = await request(app)
        .post('/api/v1/customers')
        .send(duplicateData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('email');
    });
  });

  describe('GET /api/v1/customers', () => {
    beforeEach(async () => {
      // Create test customers
      const customer1 = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Customer Alpha',
          status: 'ACTIVE',
          customer_tier: 'TIER1',
        });

      const customer2 = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Customer Beta',
          status: 'LEAD',
          customer_tier: 'NEW',
        });

      testCustomerId = customer1.body.data.id;
    });

    it('should return list of customers', async () => {
      const response = await request(app).get('/api/v1/customers').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.count).toBeGreaterThan(0);
      expect(response.body.data.length).toBe(response.body.count);
    });

    it('should filter customers by status', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .query({ status: 'ACTIVE' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.every((c: any) => c.status === 'ACTIVE')).toBe(true);
    });

    it('should filter customers by tier', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .query({ tier: 'TIER1' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.every((c: any) => c.customer_tier === 'TIER1')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(10);
      expect(response.body).toHaveProperty('totalPages');
    });

    it('should support search by name', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .query({ search: 'Alpha' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      if (response.body.data.length > 0) {
        expect(response.body.data[0].legal_name).toContain('Alpha');
      }
    });
  });

  describe('GET /api/v1/customers/:id', () => {
    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Customer Single',
          primary_email: 'single@test.com',
        });

      testCustomerId = response.body.data.id;
    });

    it('should return customer by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testCustomerId);
      expect(response.body.data.legal_name).toBe('Test Customer Single');
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/v1/customers/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('PATCH /api/v1/customers/:id', () => {
    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Customer Update',
          status: 'LEAD',
        });

      testCustomerId = response.body.data.id;
    });

    it('should update customer successfully', async () => {
      const updates = {
        status: 'ACTIVE',
        customer_tier: 'TIER2',
      };

      const response = await request(app)
        .patch(`/api/v1/customers/${testCustomerId}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACTIVE');
      expect(response.body.data.customer_tier).toBe('TIER2');
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .patch(`/api/v1/customers/${fakeId}`)
        .send({ status: 'ACTIVE' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/customers/:id/convert', () => {
    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Lead Convert',
          status: 'LEAD',
        });

      testCustomerId = response.body.data.id;
    });

    it('should convert lead to customer', async () => {
      const response = await request(app)
        .post(`/api/v1/customers/${testCustomerId}/convert`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACTIVE');
      expect(response.body.data.customer_code).toMatch(/^CUST/);
    });

    it('should return 400 when converting non-lead', async () => {
      // First convert the lead
      await request(app).post(`/api/v1/customers/${testCustomerId}/convert`).expect(200);

      // Try to convert again
      const response = await request(app)
        .post(`/api/v1/customers/${testCustomerId}/convert`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('lead');
    });
  });

  describe('DELETE /api/v1/customers/:id', () => {
    beforeEach(async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Customer Delete',
        });

      testCustomerId = response.body.data.id;
    });

    it('should delete customer successfully', async () => {
      await request(app).delete(`/api/v1/customers/${testCustomerId}`).expect(204);

      // Verify customer is deleted
      const getResponse = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .expect(404);

      expect(getResponse.body.success).toBe(false);
    });

    it('should return 404 for non-existent customer', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .delete(`/api/v1/customers/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Customer Contacts API', () => {
    beforeEach(async () => {
      // Create test customer
      const customerResponse = await request(app)
        .post('/api/v1/customers')
        .send({
          legal_name: 'Test Customer Contacts',
        });

      testCustomerId = customerResponse.body.data.id;
    });

    describe('POST /api/v1/customers/:id/contacts', () => {
      it('should create contact for customer', async () => {
        const contactData = {
          full_name: 'John Smith',
          email: 'john@test.com',
          phone: '+91-9876543210',
          designation: 'CEO',
          is_primary: true,
        };

        const response = await request(app)
          .post(`/api/v1/customers/${testCustomerId}/contacts`)
          .send(contactData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.full_name).toBe(contactData.full_name);
        expect(response.body.data.email).toBe(contactData.email);
        expect(response.body.data.customer_id).toBe(testCustomerId);

        testContactId = response.body.data.id;
      });

      it('should return 400 for missing required fields', async () => {
        const invalidData = {
          // Missing full_name and email
          phone: '+91-9876543210',
        };

        const response = await request(app)
          .post(`/api/v1/customers/${testCustomerId}/contacts`)
          .send(invalidData)
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('should return 404 for non-existent customer', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const contactData = {
          full_name: 'John Smith',
          email: 'john@test.com',
        };

        const response = await request(app)
          .post(`/api/v1/customers/${fakeId}/contacts`)
          .send(contactData)
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/v1/customers/:id/contacts', () => {
      beforeEach(async () => {
        // Create test contacts
        await request(app)
          .post(`/api/v1/customers/${testCustomerId}/contacts`)
          .send({
            full_name: 'Contact 1',
            email: 'contact1@test.com',
            is_primary: true,
          });

        await request(app)
          .post(`/api/v1/customers/${testCustomerId}/contacts`)
          .send({
            full_name: 'Contact 2',
            email: 'contact2@test.com',
            is_primary: false,
          });
      });

      it('should return all contacts for customer', async () => {
        const response = await request(app)
          .get(`/api/v1/customers/${testCustomerId}/contacts`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeGreaterThanOrEqual(2);
        expect(response.body.data.every((c: any) => c.customer_id === testCustomerId)).toBe(true);
      });

      it('should return 404 for non-existent customer', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';

        const response = await request(app)
          .get(`/api/v1/customers/${fakeId}/contacts`)
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });
  });
});
