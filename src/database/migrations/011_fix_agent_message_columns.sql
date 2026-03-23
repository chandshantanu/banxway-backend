-- Migration: 011_fix_agent_message_columns.sql
-- Purpose: Add missing agent pipeline status columns
-- Created: 2026-03-24
--
-- Root cause: agent-result.worker.ts was writing to agent_intent, agent_entities,
-- agent_confidence (non-existent columns). The correct schema columns are intent,
-- extracted_data, confidence_score (from 001_initial_schema.sql). This migration
-- adds the two genuinely missing columns that have no equivalent in the schema.
--
-- Dependencies: 001_initial_schema.sql (communication_messages, communication_threads)

-- Add ai_processing_status to communication_messages
-- Tracks which agent layer has processed this specific message
ALTER TABLE communication_messages
  ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(50)
    CHECK (ai_processing_status IN ('pending', 'ingesting', 'processing', 'processed', 'failed'));

-- Add agent_status to communication_threads
-- Tracks the overall AI pipeline stage for the thread
ALTER TABLE communication_threads
  ADD COLUMN IF NOT EXISTS agent_status VARCHAR(50)
    CHECK (agent_status IN ('pending', 'ingesting', 'processing', 'extracting', 'business', 'validation', 'complete', 'failed'));

-- Indexes for filtering by pipeline status
CREATE INDEX IF NOT EXISTS idx_messages_ai_status
  ON communication_messages(ai_processing_status)
  WHERE ai_processing_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_agent_status
  ON communication_threads(agent_status)
  WHERE agent_status IS NOT NULL;
