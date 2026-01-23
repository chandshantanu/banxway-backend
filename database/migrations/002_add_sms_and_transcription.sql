-- Migration: Add SMS and Transcription Support
-- Date: 2026-01-23
-- Description: Adds transcription fields for voice messages and ensures SMS channel support

-- Add transcription fields to communication_messages table
ALTER TABLE communication_messages
ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS transcription_language VARCHAR(10),
ADD COLUMN IF NOT EXISTS transcription_confidence NUMERIC(3,2);

-- Update channel enum to ensure SMS is included
-- First, drop the constraint if it exists
ALTER TABLE communication_messages
DROP CONSTRAINT IF EXISTS valid_channel;

-- Add the constraint with all channels including SMS
ALTER TABLE communication_messages
ADD CONSTRAINT valid_channel
CHECK (channel IN ('EMAIL', 'WHATSAPP', 'WECHAT', 'SMS', 'VOICE', 'PORTAL', 'SLACK', 'TEAMS', 'INSTAGRAM', 'FACEBOOK'));

-- Add index for transcription jobs
CREATE INDEX IF NOT EXISTS idx_messages_transcription
ON communication_messages(transcription_status)
WHERE channel = 'VOICE' AND transcription_status = 'PENDING';

-- Add index for channel-specific queries
CREATE INDEX IF NOT EXISTS idx_messages_channel_status
ON communication_messages(channel, status, created_at DESC);

-- Add index for external_id lookups (for webhook updates)
CREATE INDEX IF NOT EXISTS idx_messages_external_id
ON communication_messages(external_id)
WHERE external_id IS NOT NULL;

-- Add comment to transcription_status field
COMMENT ON COLUMN communication_messages.transcription_status IS 'Status of voice transcription: PENDING, IN_PROGRESS, COMPLETED, FAILED';

-- Add comment to transcription_language field
COMMENT ON COLUMN communication_messages.transcription_language IS 'Detected language code (e.g., en, es, fr)';

-- Add comment to transcription_confidence field
COMMENT ON COLUMN communication_messages.transcription_confidence IS 'Confidence score of transcription (0.00 to 1.00)';
