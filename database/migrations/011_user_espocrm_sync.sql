-- Migration 011: User EspoCRM Sync Support
-- Purpose: Enable syncing Banxway users to EspoCRM
-- Created: 2026-01-26
-- CRITICAL: Users in Banxway must exist in EspoCRM for authentication and data ownership

-- Add EspoCRM user ID column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS espocrm_user_id VARCHAR(255);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_espocrm_user_id ON users(espocrm_user_id);

-- Update sync logs entity_type enum to include USER (if using enum constraint)
-- Note: If crm_sync_logs uses text instead of enum, this is not needed

-- Add comment
COMMENT ON COLUMN users.espocrm_user_id IS 'EspoCRM User ID - links Banxway user to EspoCRM user';
