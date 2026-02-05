-- Migration: 008_thread_count_functions.sql
-- Add functions to increment thread message counts atomically
-- Created: 2026-02-05

-- Function to increment message count when a new message is added
CREATE OR REPLACE FUNCTION increment_thread_message_count(
  p_thread_id UUID,
  p_is_inbound BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE communication_threads
  SET 
    message_count = message_count + 1,
    unread_count = CASE 
      WHEN p_is_inbound THEN unread_count + 1 
      ELSE unread_count 
    END,
    last_message_at = NOW(),
    last_activity_at = NOW()
  WHERE id = p_thread_id;
END;
$$;

-- Function to mark messages as read and update unread count
CREATE OR REPLACE FUNCTION mark_thread_messages_read(
  p_thread_id UUID
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update unread count
  UPDATE communication_threads
  SET unread_count = 0
  WHERE id = p_thread_id;
  
  -- Mark messages as read
  UPDATE communication_messages
  SET status = 'READ'
  WHERE thread_id = p_thread_id
    AND direction = 'INBOUND'
    AND status IN ('DELIVERED', 'RECEIVED');
END;
$$;

COMMENT ON FUNCTION increment_thread_message_count IS 'Atomically increment thread message counts';
COMMENT ON FUNCTION mark_thread_messages_read IS 'Mark all inbound messages in thread as read';
