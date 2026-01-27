-- Migration: 010_crm_sync_logs.sql
-- Purpose: Track CRM synchronization operations between Banxway and EspoCRM
-- Created: 2026-01-26
-- Author: Development Team

-- IMPORTANT: Dependencies
-- This migration requires:
-- - Migration 008_crm_leads.sql (for crm_customers table)

-- ============================================================================
-- CRM Sync Logs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity information
  entity_type VARCHAR(50) NOT NULL, -- 'customer', 'contact', 'quotation'
  entity_id UUID NOT NULL, -- ID in Banxway system
  espocrm_id VARCHAR(100), -- ID in EspoCRM

  -- Sync direction
  sync_direction VARCHAR(50) NOT NULL, -- 'to_espocrm', 'from_espocrm'

  -- Sync status
  status VARCHAR(50) NOT NULL DEFAULT 'success', -- 'success', 'failed', 'skipped'
  error_message TEXT,

  -- Metadata
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_crm_sync_logs_entity ON crm_sync_logs(entity_type, entity_id);
CREATE INDEX idx_crm_sync_logs_espocrm ON crm_sync_logs(espocrm_id);
CREATE INDEX idx_crm_sync_logs_synced_at ON crm_sync_logs(synced_at DESC);
CREATE INDEX idx_crm_sync_logs_status ON crm_sync_logs(status);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE crm_sync_logs IS 'Tracks synchronization operations between Banxway and EspoCRM';
COMMENT ON COLUMN crm_sync_logs.entity_type IS 'Type of entity: customer, contact, quotation';
COMMENT ON COLUMN crm_sync_logs.entity_id IS 'ID of entity in Banxway system';
COMMENT ON COLUMN crm_sync_logs.espocrm_id IS 'ID of entity in EspoCRM';
COMMENT ON COLUMN crm_sync_logs.sync_direction IS 'Direction of sync: to_espocrm or from_espocrm';
COMMENT ON COLUMN crm_sync_logs.status IS 'Sync status: success, failed, or skipped';
COMMENT ON COLUMN crm_sync_logs.error_message IS 'Error message if sync failed';

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE crm_sync_logs ENABLE ROW LEVEL SECURITY;

-- Admin users can see all sync logs
CREATE POLICY "Admins can view all sync logs"
  ON crm_sync_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- Summary View
-- ============================================================================

-- Create view for sync statistics
CREATE OR REPLACE VIEW crm_sync_stats AS
SELECT
  entity_type,
  sync_direction,
  status,
  COUNT(*) as sync_count,
  MAX(synced_at) as last_sync_at
FROM crm_sync_logs
WHERE synced_at >= NOW() - INTERVAL '30 days'
GROUP BY entity_type, sync_direction, status;

COMMENT ON VIEW crm_sync_stats IS 'Summary statistics for CRM sync operations (last 30 days)';

-- Grant access to view
GRANT SELECT ON crm_sync_stats TO authenticated;

-- ============================================================================
-- Cleanup Function
-- ============================================================================

-- Function to clean up old sync logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM crm_sync_logs
  WHERE synced_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_sync_logs IS 'Deletes sync logs older than 90 days';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Migration 010_crm_sync_logs.sql completed successfully';
END $$;
