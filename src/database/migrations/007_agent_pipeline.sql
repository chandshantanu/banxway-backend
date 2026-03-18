-- Migration: 007_agent_pipeline.sql
-- Purpose: Agent execution tracking and document extraction results
-- Created: 2026-02-26

-- Agent execution audit log (tracks every agent invocation)
CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  agent_key VARCHAR(100) NOT NULL,
  layer VARCHAR(50) NOT NULL CHECK (layer IN ('INGESTION', 'PROCESSING', 'DOCUMENTS', 'BUSINESS', 'VALIDATION')),
  execution_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  -- The entity this execution is about (threadId, messageId, documentId, etc.)
  entity_id UUID,
  entity_type VARCHAR(50),
  -- Input/output payloads
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document extraction results (from L3 agents + local OpenRouter extraction)
CREATE TABLE IF NOT EXISTS document_extractions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id VARCHAR(255) NOT NULL,
  thread_id UUID REFERENCES communication_threads(id) ON DELETE SET NULL,
  message_id UUID,
  -- Document metadata
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('pdf', 'excel', 'word', 'image', 'unknown')),
  file_name VARCHAR(500),
  storage_url TEXT,
  mime_type VARCHAR(100),
  -- Extraction results
  extracted_fields JSONB DEFAULT '{}',
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  raw_text TEXT,
  page_count INTEGER,
  -- Processing metadata
  extraction_model VARCHAR(100),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (document_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_id ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_layer ON agent_executions(layer);
CREATE INDEX IF NOT EXISTS idx_agent_executions_entity ON agent_executions(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at ON agent_executions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_extractions_thread ON document_extractions(thread_id);
CREATE INDEX IF NOT EXISTS idx_document_extractions_status ON document_extractions(status);
CREATE INDEX IF NOT EXISTS idx_document_extractions_type ON document_extractions(document_type);
CREATE INDEX IF NOT EXISTS idx_document_extractions_created_at ON document_extractions(created_at DESC);

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_executions_updated_at ON agent_executions;
CREATE TRIGGER agent_executions_updated_at
  BEFORE UPDATE ON agent_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS document_extractions_updated_at ON document_extractions;
CREATE TRIGGER document_extractions_updated_at
  BEFORE UPDATE ON document_extractions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
