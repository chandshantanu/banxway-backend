-- Migration: 013_communication_actions_approval.sql
-- Purpose: Add human approval workflow fields to communication_actions table
-- Created: 2026-02-05
-- Author: Claude Sonnet 4.5

-- IMPORTANT: Dependencies
-- This migration requires:
-- - Migration 001_initial_schema.sql (for communication_actions table)

-- IMPORTANT: What This Does
-- Adds human-in-the-loop approval fields to support AI-generated actions
-- that require human review before execution

-- =====================================================
-- STEP 1: Add AWAITING_APPROVAL to action_status enum
-- =====================================================

-- PostgreSQL doesn't allow direct ALTER TYPE, so we need to:
-- 1. Add new value to enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'AWAITING_APPROVAL'
    AND enumtypid = 'action_status'::regtype
  ) THEN
    ALTER TYPE action_status ADD VALUE 'AWAITING_APPROVAL' AFTER 'BLOCKED';
  END IF;
END $$;

-- =====================================================
-- STEP 2: Add Human Approval Fields
-- =====================================================

-- Add requires_human_approval flag
ALTER TABLE communication_actions
ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN DEFAULT false;

-- Add approved_by user reference
ALTER TABLE communication_actions
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

-- Add approved_at timestamp
ALTER TABLE communication_actions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add approval_notes for human feedback
ALTER TABLE communication_actions
ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- =====================================================
-- STEP 3: Create Indexes for Approval Queries
-- =====================================================

-- Index for finding actions needing approval (most common query)
CREATE INDEX IF NOT EXISTS idx_actions_awaiting_approval
ON communication_actions(requires_human_approval, status)
WHERE requires_human_approval = true AND status = 'AWAITING_APPROVAL';

-- Index for finding actions approved by a specific user (audit trail)
CREATE INDEX IF NOT EXISTS idx_actions_approved_by
ON communication_actions(approved_by)
WHERE approved_by IS NOT NULL;

-- Index for finding unapproved actions assigned to user
CREATE INDEX IF NOT EXISTS idx_actions_assigned_approval
ON communication_actions(assigned_to, requires_human_approval, status)
WHERE requires_human_approval = true AND status = 'AWAITING_APPROVAL';

-- =====================================================
-- STEP 4: Add Comments for Documentation
-- =====================================================

COMMENT ON COLUMN communication_actions.requires_human_approval IS
'If true, this action must be approved by a human before execution (human-in-the-loop)';

COMMENT ON COLUMN communication_actions.approved_by IS
'User ID who approved this action (for audit trail and accountability)';

COMMENT ON COLUMN communication_actions.approved_at IS
'Timestamp when action was approved by human reviewer';

COMMENT ON COLUMN communication_actions.approval_notes IS
'Human reviewer notes/feedback on the action (corrections, clarifications, etc.)';

COMMENT ON INDEX idx_actions_awaiting_approval IS
'Optimized index for finding actions requiring human approval in pending state';

-- =====================================================
-- STEP 5: Update Updated_at Trigger (if not exists)
-- =====================================================

-- Ensure updated_at is automatically updated
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_communication_actions_updated_at'
  ) THEN
    CREATE TRIGGER update_communication_actions_updated_at
    BEFORE UPDATE ON communication_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify enum value added
-- SELECT unnest(enum_range(NULL::action_status)) AS action_status;

-- Verify columns added
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'communication_actions'
-- AND column_name IN ('requires_human_approval', 'approved_by', 'approved_at', 'approval_notes');

-- Verify indexes created
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'communication_actions'
-- AND indexname LIKE 'idx_actions_%approval%';
