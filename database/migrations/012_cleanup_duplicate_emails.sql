-- Migration: 012_cleanup_duplicate_emails.sql
-- Purpose: Remove duplicate emails and prevent future duplicates
-- Date: 2026-02-04

-- Step 1: Delete duplicate emails, keeping only the oldest one per external_id
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete duplicates, keeping the oldest record (lowest id)
  DELETE FROM communication_messages a
  USING communication_messages b
  WHERE a.id > b.id 
    AND a.external_id = b.external_id 
    AND a.external_id IS NOT NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate email records', deleted_count;
END $$;

-- Step 2: Add UNIQUE constraint to prevent future duplicates
-- Drop old index if exists
DROP INDEX IF EXISTS idx_messages_external_id;

-- Add UNIQUE constraint directly (this creates the index automatically)
-- NULL values are allowed to duplicate in UNIQUE constraints, which is what we want
ALTER TABLE communication_messages 
DROP CONSTRAINT IF EXISTS unique_external_id;

ALTER TABLE communication_messages
ADD CONSTRAINT unique_external_id UNIQUE (external_id);

-- Step 3: Clean up orphaned threads (threads with no messages)
DELETE FROM communication_threads 
WHERE id NOT IN (
  SELECT DISTINCT thread_id 
  FROM communication_messages 
  WHERE thread_id IS NOT NULL
) AND created_at < NOW() - INTERVAL '7 days';

-- Verify results
DO $$
DECLARE
  unique_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT external_id) INTO unique_count
  FROM communication_messages 
  WHERE external_id IS NOT NULL;
  
  SELECT COUNT(*) INTO total_count
  FROM communication_messages 
  WHERE external_id IS NOT NULL;
  
  RAISE NOTICE 'Cleanup complete: % unique emails, % total records (should match)', unique_count, total_count;
END $$;

COMMENT ON CONSTRAINT unique_external_id ON communication_messages IS 'Ensures no duplicate emails can be inserted (NULL values allowed)';
