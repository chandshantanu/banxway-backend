-- Migration: 014_shipment_type_enum_expansion.sql
-- Purpose: Expand shipment_type enum to cover all 9 main logistics workflows
-- Created: 2026-02-05
-- Author: Claude Sonnet 4.5

-- IMPORTANT: Dependencies
-- This migration requires:
-- - Migration 007_freight_workflows.sql (for shipment_type enum)

-- IMPORTANT: What This Does
-- Expands the shipment_type enum to include:
-- 1. SEA_IMPORT - Missing from original enum
-- 2. SEA_EXPORT - For completeness (Sea Export workflow)
-- 3. SEA_THIRD_COUNTRY - Split from SEA_AIR_THIRD_COUNTRY
-- 4. AIR_THIRD_COUNTRY - Split from SEA_AIR_THIRD_COUNTRY

-- =====================================================
-- STEP 1: Add Missing Shipment Types to Enum
-- =====================================================

-- Add SEA_IMPORT (most critical - mentioned in plan as missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SEA_IMPORT'
    AND enumtypid = 'shipment_type'::regtype
  ) THEN
    ALTER TYPE shipment_type ADD VALUE 'SEA_IMPORT';
  END IF;
END $$;

-- Add SEA_EXPORT for completeness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SEA_EXPORT'
    AND enumtypid = 'shipment_type'::regtype
  ) THEN
    ALTER TYPE shipment_type ADD VALUE 'SEA_EXPORT';
  END IF;
END $$;

-- Add SEA_THIRD_COUNTRY (cross-trade via sea)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SEA_THIRD_COUNTRY'
    AND enumtypid = 'shipment_type'::regtype
  ) THEN
    ALTER TYPE shipment_type ADD VALUE 'SEA_THIRD_COUNTRY';
  END IF;
END $$;

-- Add AIR_THIRD_COUNTRY (cross-trade via air)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'AIR_THIRD_COUNTRY'
    AND enumtypid = 'shipment_type'::regtype
  ) THEN
    ALTER TYPE shipment_type ADD VALUE 'AIR_THIRD_COUNTRY';
  END IF;
END $$;

-- =====================================================
-- STEP 2: Add shipment_type Column to workflow_definitions (if not exists)
-- =====================================================

-- Check if workflow_definitions table has shipment_types column
-- (It should exist from migration 007 or 008, but we add it if missing)
ALTER TABLE workflow_definitions
ADD COLUMN IF NOT EXISTS shipment_types shipment_type[] DEFAULT ARRAY[]::shipment_type[];

-- Create index for fast lookup by shipment type
CREATE INDEX IF NOT EXISTS idx_workflow_defs_shipment_types
ON workflow_definitions USING GIN(shipment_types)
WHERE status = 'ACTIVE';

-- =====================================================
-- STEP 3: Add Comments for Documentation
-- =====================================================

COMMENT ON COLUMN workflow_definitions.shipment_types IS
'Array of shipment types this workflow applies to (e.g., SEA_IMPORT, AIR_EXPORT, ODC)';

COMMENT ON INDEX idx_workflow_defs_shipment_types IS
'GIN index for fast lookup of workflows by shipment type using array overlap operator';

-- =====================================================
-- STEP 4: Add Helper Function for Workflow Matching
-- =====================================================

-- Function to find workflows matching a shipment type
CREATE OR REPLACE FUNCTION find_workflows_by_shipment_type(
  p_shipment_type shipment_type
)
RETURNS TABLE (
  workflow_id UUID,
  workflow_name VARCHAR(255),
  workflow_description TEXT,
  is_template BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wd.id,
    wd.name,
    wd.description,
    COALESCE(wd.is_template, false) as is_template
  FROM workflow_definitions wd
  WHERE
    wd.status = 'ACTIVE'
    AND p_shipment_type = ANY(wd.shipment_types)
  ORDER BY
    wd.is_template DESC,  -- Templates first
    wd.created_at DESC;   -- Most recent first
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_workflows_by_shipment_type IS
'Find active workflows that match a given shipment type (used by workflow matcher service)';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify all shipment types exist
-- SELECT unnest(enum_range(NULL::shipment_type)) AS shipment_type ORDER BY 1;

-- Expected output (9 types total):
-- AIR_EXPORT
-- AIR_IMPORT
-- AIR_THIRD_COUNTRY
-- BREAK_BULK_EXPORT
-- BREAK_BULK_IMPORT
-- ODC_EXPORT
-- ODC_IMPORT
-- SEA_EXPORT
-- SEA_IMPORT
-- SEA_THIRD_COUNTRY
-- (SEA_AIR_THIRD_COUNTRY may still exist for backward compatibility)

-- Verify shipment_types column exists on workflow_definitions
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'workflow_definitions'
-- AND column_name = 'shipment_types';

-- Test the helper function
-- SELECT * FROM find_workflows_by_shipment_type('SEA_IMPORT'::shipment_type);
