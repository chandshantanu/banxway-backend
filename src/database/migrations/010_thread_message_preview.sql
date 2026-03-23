-- Migration: 010_thread_message_preview.sql
-- Purpose: Add last_message_preview to communication_threads for inbox UI display
-- Created: 2026-03-23

ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT;

-- Backfill from existing messages (last message per thread)
UPDATE communication_threads t
SET last_message_preview = (
  SELECT SUBSTRING(m.content, 1, 200)
  FROM communication_messages m
  WHERE m.thread_id = t.id
  ORDER BY m.created_at DESC
  LIMIT 1
)
WHERE last_message_preview IS NULL;

-- Update trigger: keep preview current whenever a message is inserted
CREATE OR REPLACE FUNCTION update_thread_last_message_preview()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE communication_threads
  SET last_message_preview = SUBSTRING(NEW.content, 1, 200)
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_thread_preview ON communication_messages;
CREATE TRIGGER trigger_update_thread_preview
  AFTER INSERT ON communication_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_last_message_preview();
