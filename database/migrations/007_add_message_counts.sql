-- Migration: 007_add_message_counts.sql
-- Add message count columns to communication_threads for efficient filtering
-- Created: 2026-02-05

-- Add columns for message counts
ALTER TABLE communication_threads
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_threads_unread_count ON communication_threads(unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_threads_starred ON communication_threads(starred) WHERE starred = true;

-- Backfill existing threads with message counts
UPDATE communication_threads ct
SET 
  message_count = (
    SELECT COUNT(*)
    FROM communication_messages cm
    WHERE cm.thread_id = ct.id
  ),
  unread_count = (
    SELECT COUNT(*)
    FROM communication_messages cm
    WHERE cm.thread_id = ct.id
      AND cm.direction = 'INBOUND'
      AND cm.status IN ('DELIVERED', 'RECEIVED')
  );

-- Add comment
COMMENT ON COLUMN communication_threads.message_count IS 'Total number of messages in thread (maintained by application)';
COMMENT ON COLUMN communication_threads.unread_count IS 'Number of unread inbound messages (maintained by application)';
