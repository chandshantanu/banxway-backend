/**
 * Quotations API Integration Tests
 *
 * Tests for quotations API endpoints with real database connections.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/index';
import { supabaseAdmin } from '../../../src/database/supabase-admin';

describe('Quotations API', () => {
  let authToken: string;
  let testCustomerId: string;
  let testQuotationId: string;

  beforeAll(async () => {
    // Create test user and get auth token
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test_password',
    });

    if (authError) {
      throw new Error(`Auth failed: ${authError.message}`);
    }

    authToken = authData.session?.access_token || '';

    // Create test customer
    const { data: customerData, error: customerError } = await supabaseAdmin
      .from('crm_customers')
      .insert({
        legal_name: 'Test Corp for Quotations',
        primary_email: 'test@corp.com',
        status: 'ACTIVE',
        customer_tier: 'STANDARD',
      })
      .select()
      .single();

    if (customerError) {
      throw new Error(`Customer creation failed: ${customerError.message}`);
    }

    testCustomerId = customerData.id;
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (testQuotationId) {
      await supabaseAdmin.from('quotations').delete().eq('id', testQuotationId);
    }

    if (testCustomerId) {
      await supabaseAdmin.from('crm_customers').delete().eq('id', testCustomerId);
    }
  });

  describe('POST /api/v1/quotations', () => {
    it('should create quotation with valid data', async () => {
      const quotationData = {
        customer_id: testCustomerId,
        customer_name: 'Test Corp',
        customer_email: 'test@corp.com',
        shipment_type: 'AIR_IMPORT',
        origin_location: 'Mumbai',
        destination_location: 'New York',
        total_cost: 5000,
        currency: 'USD',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(app)
        .post('/api/v1/quotations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(quotationData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.quote_number).toMatch(/^QT-\d{8}-\d{3}$/);
      expect(response.body.data.customer_name).toBe('Test Corp');

      testQuotationId = response.body.data.id;
    });

    it('should return 400 when customer_id is missing', async () => {
      const invalidData = {
        customer_name: 'Test Corp',
        shipment_type: 'AIR_IMPORT',
        total_cost: 5000,
      };

      const response = await request(app)
        .post('/api/v1/quotations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('customer_id');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app).post('/api/v1/quotations').send({});

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/quotations', () => {
    it('should return list of quotations', async () => {
      const response = await request(app)
        .get('/api/v1/quotations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should filter quotations by status', async () => {
      const response = await request(app)
        .get('/api/v1/quotations?status=DRAFT')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      if (response.body.data.length > 0) {
        response.body.data.forEach((quotation: any) => {
          expect(quotation.status).toBe('DRAFT');
        });
      }
    });

    it('should filter quotations by shipment type', async () => {
      const response = await request(app)
        .get('/api/v1/quotations?shipment_type=AIR_IMPORT')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      if (response.body.data.length > 0) {
        response.body.data.forEach((quotation: any) => {
          expect(quotation.shipment_type).toBe('AIR_IMPORT');
        });
      }
    });
  });

  describe('GET /api/v1/quotations/:id', () => {
    it('should return quotation by ID', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      const response = await request(app)
        .get(`/api/v1/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testQuotationId);
    });

    it('should return 404 for non-existent quotation', async () => {
      const response = await request(app)
        .get('/api/v1/quotations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/v1/quotations/:id', () => {
    it('should update quotation', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      const updates = {
        total_cost: 6000,
        notes: 'Updated via test',
      };

      const response = await request(app)
        .patch(`/api/v1/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total_cost).toBe(6000);
      expect(response.body.data.notes).toBe('Updated via test');
    });
  });

  describe('PATCH /api/v1/quotations/:id/status', () => {
    it('should update quotation status from DRAFT to SENT', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      const response = await request(app)
        .patch(`/api/v1/quotations/${testQuotationId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'SENT' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('SENT');
    });

    it('should reject invalid status transition', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      // Try to go from SENT to DRAFT (invalid)
      const response = await request(app)
        .patch(`/api/v1/quotations/${testQuotationId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'DRAFT' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('transition');
    });
  });

  describe('POST /api/v1/quotations/:id/send', () => {
    it('should send quotation to customer', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      const response = await request(app)
        .post(`/api/v1/quotations/${testQuotationId}/send`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sent_at).toBeTruthy();
    });
  });

  describe('POST /api/v1/quotations/:id/accept', () => {
    it('should accept quotation', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      const response = await request(app)
        .post(`/api/v1/quotations/${testQuotationId}/accept`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACCEPTED');
      expect(response.body.data.accepted_at).toBeTruthy();
    });
  });

  describe('DELETE /api/v1/quotations/:id', () => {
    it('should delete quotation', async () => {
      if (!testQuotationId) {
        throw new Error('Test quotation not created');
      }

      const response = await request(app)
        .delete(`/api/v1/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/v1/quotations/${testQuotationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);

      // Clear ID to prevent double cleanup
      testQuotationId = '';
    });
  });
});
