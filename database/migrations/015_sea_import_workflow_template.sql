-- Migration: 015_sea_import_workflow_template.sql
-- Purpose: Insert SEA IMPORT workflow template (missing from initial templates)
-- Created: 2026-02-05
-- Author: Claude Sonnet 4.5

-- IMPORTANT: Dependencies
-- This migration requires:
-- - Migration 007_freight_workflows.sql (for shipment_type enum)
-- - Migration 009_seed_freight_workflow_templates.sql (for seed_workflow_template function)
-- - Migration 014_shipment_type_enum_expansion.sql (for SEA_IMPORT type)

-- IMPORTANT: What This Does
-- Creates the SEA IMPORT end-to-end workflow template covering all 11 stages:
-- Customer Onboarding → Rate Enquiry → Job Confirmation → Booking →
-- Pre-Alert → Arrival → Customs → Delivery → Costing → Billing → Closure

-- =====================================================
-- SEA IMPORT WORKFLOW TEMPLATE
-- =====================================================

-- Insert SEA IMPORT workflow template
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
  'Sea Import - End to End',
  'Complete sea import workflow from customer onboarding to job closure. Handles FCL/LCL shipments from overseas ports to Indian ports with optional customs clearance and delivery.',
  'SHIPMENT_TRACKING',
  ARRAY['SEA_IMPORT']::shipment_type[],
  ARRAY['PREMIUM', 'STANDARD', 'BASIC'],
  -- NODES: 11 stages as per workflows.md
  '[
    {
      "id": "start",
      "type": "START",
      "label": "Workflow Start",
      "position": {"x": 100, "y": 50}
    },
    {
      "id": "onboard",
      "type": "CUSTOMER_ONBOARDING",
      "label": "1. Customer Onboarding & First Contact",
      "description": "Lead created in CRM, KYC documents uploaded, credit approval, customer converted to active client",
      "sla_hours": 24,
      "position": {"x": 100, "y": 150}
    },
    {
      "id": "kyc_check",
      "type": "KYC_VERIFICATION",
      "label": "1A. KYC Status Check",
      "description": "Verify customer KYC status (Pending/Approved)",
      "sla_hours": 4,
      "position": {"x": 100, "y": 250}
    },
    {
      "id": "rate_inquiry",
      "type": "CREATE_QUOTATION",
      "label": "2. Rate Enquiry & Quotation",
      "description": "Customer requests sea import rate. Ops pulls live rates, quotation auto-generated and emailed with PDF",
      "sla_hours": 12,
      "required_data": ["POL", "POD", "incoterm", "cargo_type", "commodity"],
      "position": {"x": 100, "y": 350}
    },
    {
      "id": "job_confirm",
      "type": "CREATE_SHIPMENT",
      "label": "3. Job Confirmation (Booking Creation)",
      "description": "Customer confirms quotation. Job opened in system, status=Booking Confirmed, ops auto-assigned",
      "sla_hours": 8,
      "position": {"x": 100, "y": 450}
    },
    {
      "id": "book_agent",
      "type": "BOOK_CARRIER",
      "label": "4. Booking with Overseas Agent/Liner",
      "description": "Booking sent to overseas agent, confirmation uploaded, vessel details updated, sailing date locked",
      "sla_hours": 48,
      "position": {"x": 100, "y": 550}
    },
    {
      "id": "pre_alert",
      "type": "DOCUMENT_UPLOAD",
      "label": "5. Pre-Alert & Document Management",
      "description": "Pre-alert received, docs uploaded to job (BL, Invoice, Packing List, COO, Insurance), system validates mandatory docs",
      "sla_hours": 24,
      "required_documents": ["BL", "INVOICE", "PACKING_LIST"],
      "position": {"x": 100, "y": 650}
    },
    {
      "id": "arrival",
      "type": "SEND_NOTIFICATION",
      "label": "6. Arrival & IGM/DO Handling",
      "description": "ETA auto-updated, arrival notice sent to customer, DO request raised, DO charges posted in system",
      "sla_hours": 12,
      "position": {"x": 100, "y": 750}
    },
    {
      "id": "customs",
      "type": "FILE_CUSTOMS",
      "label": "7. Customs Clearance",
      "description": "BOE filed, duty amount captured, clearance status updated, OOC uploaded (optional service)",
      "sla_hours": 72,
      "optional": true,
      "position": {"x": 100, "y": 850}
    },
    {
      "id": "delivery",
      "type": "ASSIGN_TRANSPORTER",
      "label": "8. Delivery/CFS Movement",
      "description": "Transport arranged, container/cargo delivered, POD uploaded, job status=Delivered",
      "sla_hours": 48,
      "position": {"x": 100, "y": 950}
    },
    {
      "id": "costing",
      "type": "VALIDATE_DATA",
      "label": "9. Costing & Expense Posting",
      "description": "Vendor bills uploaded, costs approved, profitability visible per job",
      "sla_hours": 24,
      "position": {"x": 100, "y": 1050}
    },
    {
      "id": "billing",
      "type": "CREATE_INVOICE",
      "label": "10. Customer Billing (Invoice)",
      "description": "Invoice auto-generated from job, GST applied, invoice emailed to customer, posted to accounts",
      "sla_hours": 12,
      "position": {"x": 100, "y": 1150}
    },
    {
      "id": "collection",
      "type": "WAIT_FOR_EVENT",
      "label": "11. Collection & Closure",
      "description": "Outstanding tracking, payment receipt, TDS handling, job archived",
      "config": {"event": "PAYMENT_RECEIVED"},
      "sla_hours": 720,
      "position": {"x": 100, "y": 1250}
    },
    {
      "id": "end",
      "type": "END",
      "label": "Job Closed & Archived",
      "position": {"x": 100, "y": 1350}
    }
  ]'::jsonb,
  -- EDGES: Sequential flow through all stages
  '[
    {"id": "e1", "source": "start", "target": "onboard"},
    {"id": "e2", "source": "onboard", "target": "kyc_check"},
    {"id": "e3", "source": "kyc_check", "target": "rate_inquiry"},
    {"id": "e4", "source": "rate_inquiry", "target": "job_confirm"},
    {"id": "e5", "source": "job_confirm", "target": "book_agent"},
    {"id": "e6", "source": "book_agent", "target": "pre_alert"},
    {"id": "e7", "source": "pre_alert", "target": "arrival"},
    {"id": "e8", "source": "arrival", "target": "customs"},
    {"id": "e9", "source": "customs", "target": "delivery"},
    {"id": "e10", "source": "delivery", "target": "costing"},
    {"id": "e11", "source": "costing", "target": "billing"},
    {"id": "e12", "source": "billing", "target": "collection"},
    {"id": "e13", "source": "collection", "target": "end"}
  ]'::jsonb,
  -- TRIGGERS: Auto-start on shipment creation
  '{
    "auto_start": true,
    "trigger_on": ["SHIPMENT_CREATED", "QUOTATION_ACCEPTED"],
    "conditions": {
      "shipment_type": "SEA_IMPORT"
    }
  }'::jsonb,
  -- SLA CONFIG: Overall workflow SLA
  '{
    "total_sla_hours": 1200,
    "critical_path": ["rate_inquiry", "job_confirm", "book_agent", "customs", "billing"],
    "escalation_rules": [
      {"stage": "rate_inquiry", "escalate_after_hours": 12, "escalate_to": "manager"},
      {"stage": "customs", "escalate_after_hours": 72, "escalate_to": "manager"},
      {"stage": "billing", "escalate_after_hours": 12, "escalate_to": "admin"}
    ]
  }'::jsonb,
  -- TAGS: For categorization and search
  ARRAY['sea', 'import', 'fcl', 'lcl', 'customs', 'delivery', 'end-to-end'],
  -- METADATA: Additional workflow information
  '{
    "workflow_type": "SEA_IMPORT",
    "version": "1.0",
    "last_updated": "2026-02-05",
    "supported_services": ["FCL", "LCL", "DOOR_DELIVERY", "PORT_TO_PORT", "CFS", "CUSTOMS_CLEARANCE"],
    "applicable_ports": ["MUMBAI", "CHENNAI", "DELHI_ICD", "NHAVA_SHEVA", "MUNDRA"],
    "documentation_url": "/docs/workflows/sea-import",
    "estimated_duration_days": 30
  }'::jsonb,
  'ACTIVE'::workflow_status,
  true, -- is_template
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
)
ON CONFLICT (name, version) DO UPDATE
SET
  nodes = EXCLUDED.nodes,
  edges = EXCLUDED.edges,
  description = EXCLUDED.description,
  shipment_types = EXCLUDED.shipment_types,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- =====================================================
-- ADD EVENT TRIGGER FOR SEA IMPORT WORKFLOWS
-- =====================================================

-- Auto-start SEA IMPORT workflow when shipment is created
INSERT INTO workflow_event_triggers (
  event_type,
  event_source,
  workflow_id,
  condition_expression,
  priority,
  description,
  created_by
) VALUES (
  'SHIPMENT_CREATED',
  'shipments',
  (SELECT id FROM workflow_definitions WHERE name = 'Sea Import - End to End' LIMIT 1),
  '{"field": "shipment_type", "operator": "eq", "value": "SEA_IMPORT"}'::jsonb,
  10,
  'Auto-start Sea Import workflow when SEA_IMPORT shipment is created',
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify workflow created
-- SELECT id, name, description, status, is_template, shipment_types
-- FROM workflow_definitions
-- WHERE name = 'Sea Import - End to End';

-- Verify nodes count (should be 14: start + 11 stages + kyc_check + end)
-- SELECT
--   name,
--   jsonb_array_length(nodes) as node_count,
--   jsonb_array_length(edges) as edge_count
-- FROM workflow_definitions
-- WHERE name = 'Sea Import - End to End';

-- Test find_workflows_by_shipment_type function
-- SELECT * FROM find_workflows_by_shipment_type('SEA_IMPORT'::shipment_type);
