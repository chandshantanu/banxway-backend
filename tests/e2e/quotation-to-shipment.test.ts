/**
 * End-to-End Test: Quotation to Shipment Workflow
 *
 * Tests the complete workflow:
 * 1. Create customer
 * 2. Create quotation (DRAFT)
 * 3. Send quotation to customer (DRAFT → SENT)
 * 4. Accept quotation (SENT → ACCEPTED)
 * 5. Convert to shipment (ACCEPTED → CONVERTED)
 * 6. Track shipment through stages
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/index';
import { supabaseAdmin } from '../../src/database/supabase-admin';

describe('E2E: Quotation to Shipment Workflow', () => {
  let authToken: string;
  let customerId: string;
  let quotationId: string;
  let shipmentId: string;

  beforeAll(async () => {
    // Authenticate
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test_password',
    });

    if (authError) {
      throw new Error(`Auth failed: ${authError.message}`);
    }

    authToken = authData.session?.access_token || '';
  });

  afterAll(async () => {
    // Cleanup
    if (shipmentId) {
      await supabaseAdmin.from('shipments').delete().eq('id', shipmentId);
    }
    if (quotationId) {
      await supabaseAdmin.from('quotations').delete().eq('id', quotationId);
    }
    if (customerId) {
      await supabaseAdmin.from('crm_customers').delete().eq('id', customerId);
    }
  });

  it('should complete full quotation to shipment workflow', async () => {
    // ========================================================================
    // Step 1: Create Customer
    // ========================================================================

    const customerResponse = await request(app)
      .post('/api/v1/crm/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        legal_name: 'E2E Test Corp',
        primary_email: 'e2e@test.com',
        primary_phone: '+91-9876543210',
        gst_number: '27AABCU9603R1Z5',
        status: 'ACTIVE',
        customer_tier: 'STANDARD',
        credit_terms: 'NET_30',
      });

    expect(customerResponse.status).toBe(201);
    expect(customerResponse.body.success).toBe(true);

    customerId = customerResponse.body.data.id;

    console.log(`✓ Step 1: Created customer ${customerId}`);

    // ========================================================================
    // Step 2: Create Quotation (DRAFT)
    // ========================================================================

    const quotationResponse = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        customer_id: customerId,
        customer_name: 'E2E Test Corp',
        customer_email: 'e2e@test.com',
        shipment_type: 'AIR_IMPORT',
        origin_location: 'Shanghai',
        origin_country: 'China',
        destination_location: 'Mumbai',
        destination_country: 'India',
        cargo_description: 'Electronic Components',
        cargo_weight_kg: 500,
        cargo_volume_cbm: 2.5,
        total_cost: 15000,
        currency: 'USD',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'E2E test quotation',
      });

    expect(quotationResponse.status).toBe(201);
    expect(quotationResponse.body.success).toBe(true);
    expect(quotationResponse.body.data.status).toBe('DRAFT');

    quotationId = quotationResponse.body.data.id;

    console.log(`✓ Step 2: Created quotation ${quotationId} (DRAFT)`);

    // ========================================================================
    // Step 3: Send Quotation (DRAFT → SENT)
    // ========================================================================

    const sendResponse = await request(app)
      .post(`/api/v1/quotations/${quotationId}/send`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(sendResponse.status).toBe(200);
    expect(sendResponse.body.success).toBe(true);
    expect(sendResponse.body.data.status).toBe('SENT');
    expect(sendResponse.body.data.sent_at).toBeTruthy();

    console.log(`✓ Step 3: Sent quotation (SENT)`);

    // ========================================================================
    // Step 4: Accept Quotation (SENT → ACCEPTED)
    // ========================================================================

    const acceptResponse = await request(app)
      .post(`/api/v1/quotations/${quotationId}/accept`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.success).toBe(true);
    expect(acceptResponse.body.data.status).toBe('ACCEPTED');
    expect(acceptResponse.body.data.accepted_at).toBeTruthy();

    console.log(`✓ Step 4: Accepted quotation (ACCEPTED)`);

    // ========================================================================
    // Step 5: Convert to Shipment (ACCEPTED → CONVERTED)
    // ========================================================================

    const shipmentResponse = await request(app)
      .post('/api/v1/shipments')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        quotation_id: quotationId,
        customer_id: customerId,
        shipment_type: 'AIR_IMPORT',
        service_type: 'STANDARD',
        origin_country: 'China',
        origin_city: 'Shanghai',
        destination_country: 'India',
        destination_city: 'Mumbai',
        current_stage: 'BOOKING',
      });

    expect(shipmentResponse.status).toBe(201);
    expect(shipmentResponse.body.success).toBe(true);
    expect(shipmentResponse.body.data.quotation_id).toBe(quotationId);
    expect(shipmentResponse.body.data.current_stage).toBe('BOOKING');

    shipmentId = shipmentResponse.body.data.id;

    console.log(`✓ Step 5: Created shipment ${shipmentId} from quotation (BOOKING)`);

    // Update quotation status to CONVERTED
    const convertResponse = await request(app)
      .patch(`/api/v1/quotations/${quotationId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'CONVERTED' });

    expect(convertResponse.status).toBe(200);
    expect(convertResponse.body.data.status).toBe('CONVERTED');

    console.log(`✓ Step 5b: Updated quotation to CONVERTED`);

    // ========================================================================
    // Step 6: Track Shipment Through Stages
    // ========================================================================

    // Progress through stages: BOOKING → DOCUMENTATION → CUSTOMS_CLEARANCE
    const stages = ['DOCUMENTATION', 'CUSTOMS_CLEARANCE', 'CARGO_COLLECTION'];

    for (const stage of stages) {
      const stageResponse = await request(app)
        .patch(`/api/v1/shipments/${shipmentId}/stage`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stage });

      expect(stageResponse.status).toBe(200);
      expect(stageResponse.body.success).toBe(true);
      expect(stageResponse.body.data.current_stage).toBe(stage);

      console.log(`✓ Step 6: Updated shipment stage to ${stage}`);
    }

    // ========================================================================
    // Step 7: Verify Stage History
    // ========================================================================

    const historyResponse = await request(app)
      .get(`/api/v1/shipments/${shipmentId}/history`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.success).toBe(true);
    expect(historyResponse.body.data.length).toBeGreaterThanOrEqual(3);

    // Verify stages are tracked in order
    const history = historyResponse.body.data;
    expect(history.some((h: any) => h.to_stage === 'BOOKING')).toBe(true);
    expect(history.some((h: any) => h.to_stage === 'DOCUMENTATION')).toBe(true);
    expect(history.some((h: any) => h.to_stage === 'CUSTOMS_CLEARANCE')).toBe(true);

    console.log(`✓ Step 7: Verified stage history (${history.length} transitions)`);

    // ========================================================================
    // Workflow Complete
    // ========================================================================

    console.log('\n✅ E2E Workflow Complete!');
    console.log('Summary:');
    console.log(`  - Customer: ${customerId}`);
    console.log(`  - Quotation: ${quotationId} (CONVERTED)`);
    console.log(`  - Shipment: ${shipmentId} (CARGO_COLLECTION)`);
    console.log(`  - Stage transitions: ${history.length}`);
  });
});
