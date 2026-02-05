-- Migration Seed: 009_seed_freight_workflow_templates.sql
-- Purpose: Insert pre-built workflow templates for 9 freight forwarding scenarios
-- Created: 2026-02-04
-- Run after: 008_workflow_system_enhancements.sql

-- ============================================================================
-- SEED FREIGHT WORKFLOW TEMPLATES
-- ============================================================================

-- This is a placeholder for the actual workflow template data
-- The full workflow definitions are loaded via backend TypeScript code
-- This migration just ensures the workflow_definitions table is ready

-- Create a function to seed workflows from JSON
CREATE OR REPLACE FUNCTION seed_workflow_template(
  p_workflow_data JSONB
)
RETURNS UUID AS $$
DECLARE
  v_workflow_id UUID;
BEGIN
  INSERT INTO workflow_definitions (
    name,
    description,
    category,
    shipment_types,
    customer_tiers,
    nodes,
    edges,
    triggers,
    sla_config,
    tags,
    metadata,
    status,
    is_template,
    created_by
  ) VALUES (
    p_workflow_data->>'name',
    p_workflow_data->>'description',
    (p_workflow_data->>'category')::workflow_category,
    ARRAY(SELECT jsonb_array_elements_text(p_workflow_data->'shipment_types'))::shipment_type[],
    ARRAY(SELECT jsonb_array_elements_text(p_workflow_data->'customer_tiers')),
    p_workflow_data->'nodes',
    p_workflow_data->'edges',
    p_workflow_data->'triggers',
    p_workflow_data->'slaConfig',
    ARRAY(SELECT jsonb_array_elements_text(p_workflow_data->'tags')),
    p_workflow_data->'metadata',
    'ACTIVE'::workflow_status,
    true,
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
  )
  ON CONFLICT (name, version) DO UPDATE
  SET 
    nodes = EXCLUDED.nodes,
    edges = EXCLUDED.edges,
    updated_at = NOW()
  RETURNING id INTO v_workflow_id;
  
  RETURN v_workflow_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION seed_workflow_template IS 'Insert or update workflow template from JSON data';

-- Note: Actual workflow template data will be loaded via backend API
-- See: banxway-backend/src/data/freight-workflow-templates.ts
-- Run: npm run seed:workflows

-- ============================================================================
-- SEED EVENT TRIGGERS
-- ============================================================================

-- Document Upload → Document Validation Workflow
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description,
  created_by
) VALUES (
  'DOCUMENT_UPLOADED',
  'document_upload',
  (SELECT id FROM workflow_definitions WHERE name = 'Document Validation' AND is_template = false LIMIT 1),
  '{"field": "document.type", "operator": "in", "value": ["BL", "INVOICE", "PACKING_LIST"]}'::jsonb,
  10,
  'Trigger document validation when key shipping documents are uploaded',
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- Quotation Accepted → Auto-start Shipment Workflow
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description
) VALUES (
  'QUOTATION_ACCEPTED',
  'quotation_status_change',
  (SELECT id FROM workflow_definitions WHERE name LIKE '%Import - End-to-End' AND is_template = false LIMIT 1),
  '{"field": "quotation.shipment_type", "operator": "in", "value": ["SEA_IMPORT", "AIR_IMPORT"]}'::jsonb,
  20,
  'Auto-create shipment job when quotation is accepted'
)
ON CONFLICT DO NOTHING;

-- Status Change → Customer Notification (Premium tier)
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description
) VALUES (
  'STATUS_CHANGED',
  'shipment_status_change',
  (SELECT id FROM workflow_definitions WHERE name = 'Customer Status Notification' LIMIT 1),
  '{"field": "customer.tier", "operator": "equals", "value": "PREMIUM"}'::jsonb,
  15,
  'Send WhatsApp notification to premium customers on status change'
)
ON CONFLICT DO NOTHING;

-- Missed Call → Follow-up Workflow
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description
) VALUES (
  'MISSED_CALL',
  'exotel',
  (SELECT id FROM workflow_definitions WHERE name = 'Missed Call Follow-up' LIMIT 1),
  '{"field": "call.customer_id", "operator": "not_equals", "value": null}'::jsonb,
  25,
  'Create follow-up task when customer call is missed'
)
ON CONFLICT DO NOTHING;

-- TAT Warning → Escalation Workflow
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description
) VALUES (
  'TAT_WARNING',
  'task_monitor',
  (SELECT id FROM workflow_definitions WHERE name = 'Task Escalation' LIMIT 1),
  '{"field": "task.priority", "operator": "in", "value": ["HIGH", "URGENT"]}'::jsonb,
  30,
  'Escalate high priority tasks approaching TAT deadline'
)
ON CONFLICT DO NOTHING;

-- KYC Pending → Reminder Workflow
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description
) VALUES (
  'KYC_PENDING',
  'kyc_monitor',
  (SELECT id FROM workflow_definitions WHERE name = 'KYC Reminder' LIMIT 1),
  '{"field": "customer.kyc_pending_days", "operator": "greater_than", "value": 3}'::jsonb,
  5,
  'Send KYC reminder after 3 days of pending status'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- HELPER VIEWS FOR WORKFLOW MONITORING
-- ============================================================================

-- View: Active Workflow Instances Summary
CREATE OR REPLACE VIEW active_workflow_instances_summary AS
SELECT 
  wi.id,
  wi.workflow_name,
  wi.status,
  wi.current_node_id,
  wi.approval_status,
  wi.loop_iteration,
  s.reference as shipment_reference,
  c.name as customer_name,
  wi.started_at,
  EXTRACT(EPOCH FROM (NOW() - wi.started_at))/60 as running_minutes,
  wi.approval_required,
  wi.auto_decision_enabled
FROM workflow_instances wi
LEFT JOIN shipments s ON s.id = wi.shipment_id
LEFT JOIN customers c ON c.id = s.customer_id
WHERE wi.status IN ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'PAUSED')
ORDER BY wi.started_at DESC;

COMMENT ON VIEW active_workflow_instances_summary IS 'Summary view of all active workflow executions';

-- View: Workflow Performance Metrics
CREATE OR REPLACE VIEW workflow_performance_metrics AS
SELECT 
  wd.id as workflow_id,
  wd.name as workflow_name,
  wd.category,
  COUNT(wi.id) as total_executions,
  COUNT(CASE WHEN wi.status = 'COMPLETED' THEN 1 END) as completed_count,
  COUNT(CASE WHEN wi.status = 'FAILED' THEN 1 END) as failed_count,
  ROUND(
    COUNT(CASE WHEN wi.status = 'COMPLETED' THEN 1 END)::numeric / 
    NULLIF(COUNT(wi.id), 0) * 100, 
    2
  ) as success_rate_percent,
  ROUND(AVG(EXTRACT(EPOCH FROM (wi.completed_at - wi.started_at))/60)) as avg_duration_minutes,
  MAX(wi.completed_at) as last_execution_at
FROM workflow_definitions wd
LEFT JOIN workflow_instances wi ON wi.workflow_id = wd.id
WHERE wd.is_template = false
GROUP BY wd.id, wd.name, wd.category
ORDER BY total_executions DESC;

COMMENT ON VIEW workflow_performance_metrics IS 'Performance metrics per workflow definition';

-- ============================================================================
-- COMPLETE
-- ============================================================================

-- Summary
COMMENT ON SCHEMA public IS 'Workflow seed migration complete. 
Run backend seeder command to load workflow templates:
  npm run seed:workflows
  
Or load via API:
  POST /api/v1/workflows/builder/seed-templates
';
