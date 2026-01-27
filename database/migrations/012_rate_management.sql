-- Migration 012: Rate Management System
-- Purpose: Enable inventory-based and on-demand rate management
-- Created: 2026-01-26
-- CRITICAL: Supports two rate sourcing modes:
--   1. INVENTORY MODE: Pre-negotiated rates stored in database
--   2. ON-DEMAND MODE: Request quote from shipper, add margin, forward

-- ============================================================================
-- RATE CARDS (Inventory Mode - Pre-negotiated rates)
-- ============================================================================

CREATE TYPE rate_card_status AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'INACTIVE');
CREATE TYPE rate_type AS ENUM ('AIR_FREIGHT', 'SEA_FREIGHT', 'ODC', 'BREAK_BULK');

-- Shipper/Carrier Master (Airlines, Shipping Lines, GSAs, Freight Forwarders)
CREATE TABLE IF NOT EXISTS shippers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shipper details
  shipper_code VARCHAR(50) UNIQUE NOT NULL,
  shipper_name VARCHAR(255) NOT NULL,
  shipper_type VARCHAR(100), -- 'AIRLINE', 'SHIPPING_LINE', 'GSA', 'FREIGHT_FORWARDER'

  -- Contact information
  contact_person VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),

  -- Address
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),

  -- Business terms
  payment_terms VARCHAR(100), -- 'ADVANCE', 'NET_30', 'NET_60'
  credit_limit NUMERIC(12,2),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shippers_code ON shippers(shipper_code);
CREATE INDEX idx_shippers_type ON shippers(shipper_type);
CREATE INDEX idx_shippers_active ON shippers(is_active);

COMMENT ON TABLE shippers IS 'Master list of airlines, shipping lines, GSAs, and freight forwarders';
COMMENT ON COLUMN shippers.shipper_type IS 'Type: AIRLINE, SHIPPING_LINE, GSA, FREIGHT_FORWARDER';

-- Rate Cards (Inventory Mode - Pre-negotiated rates from shippers)
CREATE TABLE IF NOT EXISTS rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rate identification
  rate_card_number VARCHAR(50) UNIQUE NOT NULL,
  shipper_id UUID NOT NULL REFERENCES shippers(id) ON DELETE CASCADE,

  -- Rate details
  rate_type rate_type NOT NULL,
  shipment_type shipment_type NOT NULL,

  -- Route
  origin_airport VARCHAR(10), -- IATA code
  origin_city VARCHAR(100),
  origin_country VARCHAR(100),
  destination_airport VARCHAR(10), -- IATA code
  destination_city VARCHAR(100),
  destination_country VARCHAR(100),

  -- Cargo constraints
  commodity_type VARCHAR(100), -- 'GENERAL', 'DG', 'PHARMA', 'PERISHABLE', 'ODC'
  min_weight_kg NUMERIC(12,2),
  max_weight_kg NUMERIC(12,2),

  -- Pricing (Weight Slabs)
  -- Stored as JSONB for flexibility:
  -- [
  --   { "min_kg": 0, "max_kg": 45, "rate_per_kg": 125, "currency": "USD" },
  --   { "min_kg": 45, "max_kg": 100, "rate_per_kg": 115, "currency": "USD" },
  --   { "min_kg": 100, "max_kg": 300, "rate_per_kg": 105, "currency": "USD" }
  -- ]
  weight_slabs JSONB NOT NULL,

  -- Surcharges
  -- {
  --   "FSC": 0.15,    // Fuel Surcharge 15%
  --   "SSC": 0.05,    // Security Surcharge 5%
  --   "DG": 500       // Dangerous Goods flat fee
  -- }
  surcharges JSONB DEFAULT '{}',

  -- Additional charges
  origin_handling_charges NUMERIC(12,2) DEFAULT 0,
  destination_handling_charges NUMERIC(12,2) DEFAULT 0,

  -- Validity
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  status rate_card_status DEFAULT 'ACTIVE',

  -- Service parameters
  transit_time_days INTEGER,
  free_storage_days INTEGER DEFAULT 0,

  -- Banxway margin (for auto-quotation)
  margin_percentage NUMERIC(5,2) DEFAULT 0, -- e.g., 15.00 for 15%
  margin_flat_fee NUMERIC(12,2) DEFAULT 0,

  -- Metadata
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_cards_shipper ON rate_cards(shipper_id);
CREATE INDEX idx_rate_cards_status ON rate_cards(status);
CREATE INDEX idx_rate_cards_validity ON rate_cards(valid_from, valid_until);
CREATE INDEX idx_rate_cards_route ON rate_cards(origin_airport, destination_airport);
CREATE INDEX idx_rate_cards_type ON rate_cards(rate_type, shipment_type);

COMMENT ON TABLE rate_cards IS 'Pre-negotiated rates from shippers (Inventory Mode)';
COMMENT ON COLUMN rate_cards.weight_slabs IS 'Array of weight break rates with min/max kg and rate per kg';
COMMENT ON COLUMN rate_cards.surcharges IS 'Fuel, security, and special handling surcharges';
COMMENT ON COLUMN rate_cards.margin_percentage IS 'Banxway margin percentage to add to shipper rate';

-- ============================================================================
-- QUOTE REQUESTS (On-Demand Mode - Request quote from shipper)
-- ============================================================================

CREATE TYPE quote_request_status AS ENUM ('PENDING', 'SENT', 'RECEIVED', 'DECLINED', 'EXPIRED');
CREATE TYPE quote_source_mode AS ENUM ('INVENTORY', 'ON_DEMAND');

-- Quote Requests to Shippers (On-Demand Mode)
CREATE TABLE IF NOT EXISTS shipper_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request identification
  request_number VARCHAR(50) UNIQUE NOT NULL,
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  shipper_id UUID NOT NULL REFERENCES shippers(id) ON DELETE CASCADE,

  -- Request details
  shipment_type shipment_type NOT NULL,
  commodity_type VARCHAR(100),

  -- Route
  origin_location VARCHAR(255) NOT NULL,
  origin_country VARCHAR(100),
  destination_location VARCHAR(255) NOT NULL,
  destination_country VARCHAR(100),

  -- Cargo details
  gross_weight_kg NUMERIC(12,2) NOT NULL,
  cargo_volume_cbm NUMERIC(12,2),
  dimensions JSONB, -- { "length": 100, "width": 50, "height": 30, "unit": "cm" }

  -- Service requirements
  incoterm VARCHAR(10), -- 'EXW', 'FOB', 'CIF'
  special_handling TEXT, -- 'DG', 'PHARMA', 'PERISHABLE'
  required_by_date DATE,

  -- Shipper response
  status quote_request_status DEFAULT 'PENDING',
  shipper_quote_amount NUMERIC(12,2),
  shipper_quote_currency VARCHAR(3) DEFAULT 'USD',
  shipper_quote_validity DATE,
  shipper_quote_file_url TEXT, -- PDF/document from shipper
  shipper_response_details JSONB, -- Full structured quote from shipper

  -- Banxway margin
  margin_percentage NUMERIC(5,2) DEFAULT 0,
  margin_flat_fee NUMERIC(12,2) DEFAULT 0,
  final_quote_amount NUMERIC(12,2), -- shipper_quote + margin

  -- Timeline
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  -- Metadata
  requested_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_requests_quotation ON shipper_quote_requests(quotation_id);
CREATE INDEX idx_quote_requests_shipper ON shipper_quote_requests(shipper_id);
CREATE INDEX idx_quote_requests_status ON shipper_quote_requests(status);
CREATE INDEX idx_quote_requests_date ON shipper_quote_requests(requested_at);

COMMENT ON TABLE shipper_quote_requests IS 'On-demand quote requests sent to shippers';
COMMENT ON COLUMN shipper_quote_requests.shipper_response_details IS 'Full structured quote response from shipper';
COMMENT ON COLUMN shipper_quote_requests.final_quote_amount IS 'Shipper quote + Banxway margin';

-- ============================================================================
-- ENHANCED QUOTATIONS TABLE (Add source tracking)
-- ============================================================================

-- Add columns to existing quotations table
ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS quote_source_mode quote_source_mode DEFAULT 'ON_DEMAND',
ADD COLUMN IF NOT EXISTS rate_card_id UUID REFERENCES rate_cards(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shipper_quote_request_id UUID REFERENCES shipper_quote_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS margin_percentage NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipper_cost NUMERIC(12,2), -- Cost from shipper before margin
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX idx_quotations_source_mode ON quotations(quote_source_mode);
CREATE INDEX idx_quotations_rate_card ON quotations(rate_card_id);

COMMENT ON COLUMN quotations.quote_source_mode IS 'INVENTORY: From rate card, ON_DEMAND: Requested from shipper';
COMMENT ON COLUMN quotations.rate_card_id IS 'Reference to rate card if using inventory mode';
COMMENT ON COLUMN quotations.shipper_quote_request_id IS 'Reference to shipper quote request if on-demand mode';
COMMENT ON COLUMN quotations.shipper_cost IS 'Cost from shipper before adding Banxway margin';
COMMENT ON COLUMN quotations.margin_percentage IS 'Banxway margin percentage applied';
COMMENT ON COLUMN quotations.margin_amount IS 'Actual margin amount in quote currency';

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- Active rate cards view (simplified for quick lookups)
CREATE OR REPLACE VIEW active_rate_cards AS
SELECT
  rc.id,
  rc.rate_card_number,
  s.shipper_name,
  s.shipper_type,
  rc.rate_type,
  rc.shipment_type,
  rc.origin_airport,
  rc.origin_city,
  rc.destination_airport,
  rc.destination_city,
  rc.valid_from,
  rc.valid_until,
  rc.weight_slabs,
  rc.margin_percentage,
  rc.transit_time_days
FROM rate_cards rc
JOIN shippers s ON rc.shipper_id = s.id
WHERE rc.status = 'ACTIVE'
  AND rc.valid_from <= CURRENT_DATE
  AND rc.valid_until >= CURRENT_DATE
  AND s.is_active = true
ORDER BY rc.origin_airport, rc.destination_airport, rc.created_at DESC;

COMMENT ON VIEW active_rate_cards IS 'Currently valid rate cards for quick rate lookups';

-- Quote requests pending response
CREATE OR REPLACE VIEW pending_shipper_quotes AS
SELECT
  sqr.id,
  sqr.request_number,
  q.quote_number,
  s.shipper_name,
  s.contact_email,
  sqr.origin_location,
  sqr.destination_location,
  sqr.gross_weight_kg,
  sqr.required_by_date,
  sqr.requested_at,
  EXTRACT(DAY FROM NOW() - sqr.requested_at) as days_pending
FROM shipper_quote_requests sqr
JOIN shippers s ON sqr.shipper_id = s.id
LEFT JOIN quotations q ON sqr.quotation_id = q.id
WHERE sqr.status IN ('PENDING', 'SENT')
ORDER BY sqr.requested_at ASC;

COMMENT ON VIEW pending_shipper_quotes IS 'Quote requests awaiting shipper response';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate freight cost from rate card
CREATE OR REPLACE FUNCTION calculate_freight_cost(
  p_rate_card_id UUID,
  p_chargeable_weight NUMERIC
) RETURNS TABLE (
  freight_cost NUMERIC,
  applicable_rate NUMERIC,
  surcharge_amount NUMERIC,
  handling_charges NUMERIC,
  total_cost NUMERIC
) AS $$
DECLARE
  v_rate_card rate_cards%ROWTYPE;
  v_slab JSONB;
  v_rate_per_kg NUMERIC := 0;
  v_freight NUMERIC := 0;
  v_surcharges NUMERIC := 0;
  v_handling NUMERIC := 0;
BEGIN
  -- Get rate card
  SELECT * INTO v_rate_card FROM rate_cards WHERE id = p_rate_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rate card not found: %', p_rate_card_id;
  END IF;

  -- Find applicable weight slab
  FOR v_slab IN SELECT * FROM jsonb_array_elements(v_rate_card.weight_slabs)
  LOOP
    IF p_chargeable_weight >= (v_slab->>'min_kg')::NUMERIC AND
       p_chargeable_weight <= (v_slab->>'max_kg')::NUMERIC THEN
      v_rate_per_kg := (v_slab->>'rate_per_kg')::NUMERIC;
      EXIT;
    END IF;
  END LOOP;

  IF v_rate_per_kg = 0 THEN
    RAISE EXCEPTION 'No applicable rate slab found for weight: %', p_chargeable_weight;
  END IF;

  -- Calculate freight
  v_freight := p_chargeable_weight * v_rate_per_kg;

  -- Calculate surcharges (percentage-based)
  -- Assuming FSC and SSC are percentages in decimal form (0.15 = 15%)
  IF v_rate_card.surcharges ? 'FSC' THEN
    v_surcharges := v_surcharges + (v_freight * (v_rate_card.surcharges->>'FSC')::NUMERIC);
  END IF;

  IF v_rate_card.surcharges ? 'SSC' THEN
    v_surcharges := v_surcharges + (v_freight * (v_rate_card.surcharges->>'SSC')::NUMERIC);
  END IF;

  -- Add flat surcharges (like DG handling)
  IF v_rate_card.surcharges ? 'DG' THEN
    v_surcharges := v_surcharges + (v_rate_card.surcharges->>'DG')::NUMERIC;
  END IF;

  -- Add handling charges
  v_handling := COALESCE(v_rate_card.origin_handling_charges, 0) +
                COALESCE(v_rate_card.destination_handling_charges, 0);

  RETURN QUERY SELECT
    v_freight,
    v_rate_per_kg,
    v_surcharges,
    v_handling,
    v_freight + v_surcharges + v_handling;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_freight_cost IS 'Calculate total freight cost from rate card and chargeable weight';

-- Auto-generate rate card number
CREATE OR REPLACE FUNCTION generate_rate_card_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_date_str VARCHAR(8);
  v_sequence INTEGER;
  v_rate_card_number VARCHAR(50);
BEGIN
  v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  SELECT COALESCE(MAX(SUBSTRING(rate_card_number FROM 12)::INTEGER), 0) + 1
  INTO v_sequence
  FROM rate_cards
  WHERE rate_card_number LIKE 'RC-' || v_date_str || '-%';

  v_rate_card_number := 'RC-' || v_date_str || '-' || LPAD(v_sequence::TEXT, 3, '0');

  RETURN v_rate_card_number;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate shipper quote request number
CREATE OR REPLACE FUNCTION generate_quote_request_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  v_date_str VARCHAR(8);
  v_sequence INTEGER;
  v_request_number VARCHAR(50);
BEGIN
  v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  SELECT COALESCE(MAX(SUBSTRING(request_number FROM 13)::INTEGER), 0) + 1
  INTO v_sequence
  FROM shipper_quote_requests
  WHERE request_number LIKE 'SQR-' || v_date_str || '-%';

  v_request_number := 'SQR-' || v_date_str || '-' || LPAD(v_sequence::TEXT, 3, '0');

  RETURN v_request_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shippers_updated_at BEFORE UPDATE ON shippers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_cards_updated_at BEFORE UPDATE ON rate_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipper_quote_requests_updated_at BEFORE UPDATE ON shipper_quote_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert sample shipper
INSERT INTO shippers (shipper_code, shipper_name, shipper_type, contact_email, contact_phone, country, is_active)
VALUES
  ('AI-001', 'Air India Cargo', 'AIRLINE', 'cargo@airindia.com', '+91-11-12345678', 'India', true),
  ('EK-001', 'Emirates SkyCargo', 'AIRLINE', 'cargo@emirates.com', '+971-4-1234567', 'UAE', true),
  ('GSA-001', 'XYZ Global Freight GSA', 'GSA', 'info@xyzgsa.com', '+91-22-87654321', 'India', true)
ON CONFLICT (shipper_code) DO NOTHING;

-- Insert sample rate card (example: Air India Mumbai to Dubai)
INSERT INTO rate_cards (
  rate_card_number,
  shipper_id,
  rate_type,
  shipment_type,
  origin_airport,
  origin_city,
  origin_country,
  destination_airport,
  destination_city,
  destination_country,
  commodity_type,
  weight_slabs,
  surcharges,
  valid_from,
  valid_until,
  status,
  transit_time_days,
  free_storage_days,
  margin_percentage
)
SELECT
  'RC-20260126-001',
  id,
  'AIR_FREIGHT',
  'AIR_EXPORT',
  'BOM',
  'Mumbai',
  'India',
  'DXB',
  'Dubai',
  'UAE',
  'GENERAL',
  '[
    {"min_kg": 0, "max_kg": 45, "rate_per_kg": 125, "currency": "USD"},
    {"min_kg": 45, "max_kg": 100, "rate_per_kg": 115, "currency": "USD"},
    {"min_kg": 100, "max_kg": 300, "rate_per_kg": 105, "currency": "USD"},
    {"min_kg": 300, "max_kg": 1000, "rate_per_kg": 95, "currency": "USD"}
  ]'::jsonb,
  '{"FSC": 0.15, "SSC": 0.05}'::jsonb,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '90 days',
  'ACTIVE',
  2,
  3,
  15.00
FROM shippers
WHERE shipper_code = 'AI-001'
ON CONFLICT (rate_card_number) DO NOTHING;

-- ============================================================================
-- PERMISSIONS (if using RLS)
-- ============================================================================

-- Enable RLS if needed
-- ALTER TABLE shippers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shipper_quote_requests ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users
-- CREATE POLICY "Users can view rate cards" ON rate_cards FOR SELECT USING (auth.role() = 'authenticated');
-- CREATE POLICY "Admin can manage rate cards" ON rate_cards FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
