#!/usr/bin/env node

/**
 * Verify Migration 012 - Rate Management System
 */

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL required');
  process.exit(1);
}

console.log('🔍 Verifying Migration 012: Rate Management System\n');

async function verify() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Check shippers
    console.log('📋 Shippers:');
    const shippers = await client.query('SELECT shipper_code, shipper_name, shipper_type, is_active FROM shippers ORDER BY shipper_code');
    console.table(shippers.rows);

    // Check rate cards
    console.log('\n📊 Rate Cards:');
    const rateCards = await client.query(`
      SELECT
        rate_card_number,
        origin_airport,
        destination_airport,
        rate_type,
        status,
        valid_from::date,
        valid_until::date,
        margin_percentage
      FROM rate_cards
      ORDER BY rate_card_number
    `);
    console.table(rateCards.rows);

    // Check active rate cards view
    console.log('\n✅ Active Rate Cards (View):');
    const activeCards = await client.query(`
      SELECT
        rate_card_number,
        shipper_name,
        origin_airport,
        destination_airport,
        valid_from::date,
        valid_until::date
      FROM active_rate_cards
    `);
    console.table(activeCards.rows);

    // Test calculate_freight_cost function
    if (rateCards.rows.length > 0) {
      console.log('\n🧮 Testing calculate_freight_cost() function:');
      const rateCardId = await client.query(`
        SELECT id FROM rate_cards LIMIT 1
      `);

      if (rateCardId.rows.length > 0) {
        const calculation = await client.query(`
          SELECT * FROM calculate_freight_cost($1, 150.0)
        `, [rateCardId.rows[0].id]);

        console.log('\nFor 150kg cargo:');
        console.table(calculation.rows);
      }
    }

    // Check quotations enhancement
    console.log('\n📝 Quotations Table Enhancement:');
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'quotations'
      AND column_name IN ('quote_source_mode', 'rate_card_id', 'shipper_quote_request_id', 'margin_percentage', 'margin_amount', 'shipper_cost')
      ORDER BY column_name
    `);
    console.table(columns.rows);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Migration 012 verified successfully!');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verify();
