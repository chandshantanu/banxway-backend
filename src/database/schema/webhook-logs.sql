-- =====================================================
-- Webhook Logs Schema
-- Purpose: Track and debug Exotel webhook deliveries
-- =====================================================

-- Create webhook_logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type VARCHAR(50) NOT NULL, -- 'call', 'whatsapp', 'sms'
  payload JSONB NOT NULL,
  headers JSONB,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  external_id VARCHAR(255), -- CallSid, MessageSid, SmsSid
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_type ON webhook_logs(webhook_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_external_id ON webhook_logs(external_id);

-- Index for searching by payload fields
CREATE INDEX IF NOT EXISTS idx_webhook_logs_payload_gin ON webhook_logs USING gin(payload);

-- Comment on table
COMMENT ON TABLE webhook_logs IS 'Logs all webhook deliveries from Exotel for debugging and monitoring';

-- Comment on columns
COMMENT ON COLUMN webhook_logs.webhook_type IS 'Type of webhook: call, whatsapp, or sms';
COMMENT ON COLUMN webhook_logs.payload IS 'Full webhook payload from Exotel';
COMMENT ON COLUMN webhook_logs.headers IS 'HTTP headers from webhook request';
COMMENT ON COLUMN webhook_logs.processed IS 'Whether webhook was successfully processed';
COMMENT ON COLUMN webhook_logs.error IS 'Error message if processing failed';
COMMENT ON COLUMN webhook_logs.external_id IS 'Exotel ID (CallSid, MessageSid, or SmsSid)';

-- =====================================================
-- Retention Policy Function
-- =====================================================

CREATE OR REPLACE FUNCTION delete_old_webhook_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM webhook_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION delete_old_webhook_logs() IS 'Deletes webhook logs older than 30 days';

-- =====================================================
-- Webhook Statistics View
-- =====================================================

CREATE OR REPLACE VIEW webhook_stats AS
SELECT
  webhook_type,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_webhooks,
  SUM(CASE WHEN processed THEN 1 ELSE 0 END) as processed_count,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as failed_count,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds,
  MIN(created_at) as first_webhook,
  MAX(created_at) as last_webhook
FROM webhook_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY webhook_type, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC, webhook_type;

COMMENT ON VIEW webhook_stats IS 'Hourly webhook statistics for the past 7 days';

-- =====================================================
-- Failed Webhooks View
-- =====================================================

CREATE OR REPLACE VIEW failed_webhooks AS
SELECT
  id,
  webhook_type,
  external_id,
  error,
  payload,
  created_at
FROM webhook_logs
WHERE error IS NOT NULL
ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW failed_webhooks IS 'Last 100 failed webhooks for debugging';

-- =====================================================
-- Permissions (if using RLS)
-- =====================================================

-- Grant access to authenticated users
-- ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow authenticated users to view webhook logs"
--   ON webhook_logs FOR SELECT
--   TO authenticated
--   USING (true);

-- =====================================================
-- Sample Queries
-- =====================================================

-- Get webhook health for last hour
-- SELECT * FROM webhook_stats WHERE hour > NOW() - INTERVAL '1 hour';

-- Get recent failed webhooks
-- SELECT * FROM failed_webhooks;

-- Get webhooks for specific call
-- SELECT * FROM webhook_logs WHERE external_id = 'CALL_SID_HERE';

-- Get webhook processing time distribution
-- SELECT
--   webhook_type,
--   PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processed_at - created_at))) as median_seconds,
--   PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processed_at - created_at))) as p95_seconds
-- FROM webhook_logs
-- WHERE processed AND created_at > NOW() - INTERVAL '24 hours'
-- GROUP BY webhook_type;
