-- Migration: 009_excel_import_jobs.sql
-- Purpose: Create Excel/CSV import job tracking tables
-- Created: 2026-01-26
-- Author: Claude Sonnet 4.5
-- Dependencies: 001_initial_schema.sql (for users table)

-- ============================================================================
-- Custom Types for Excel Import
-- ============================================================================

-- Import job status
CREATE TYPE import_job_status AS ENUM (
  'PENDING',              -- File uploaded, waiting to process
  'VALIDATING',           -- Validating file format and data
  'PROCESSING',           -- Processing rows
  'COMPLETED',            -- Successfully completed
  'COMPLETED_WITH_ERRORS', -- Completed but some rows failed
  'FAILED',               -- Job failed completely
  'CANCELLED'             -- User cancelled the job
);

-- Import entity types
CREATE TYPE import_entity_type AS ENUM (
  'CUSTOMERS',            -- Import CRM customers
  'CONTACTS',             -- Import customer contacts
  'QUOTATIONS',           -- Import quotations
  'SHIPMENTS',            -- Import shipments
  'LEADS'                 -- Import leads
);

COMMENT ON TYPE import_job_status IS 'Status workflow for import jobs';
COMMENT ON TYPE import_entity_type IS 'Type of data being imported';

-- ============================================================================
-- EXCEL IMPORT JOBS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS excel_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job identification
  job_number VARCHAR(50) UNIQUE NOT NULL,

  -- Import details
  import_type import_entity_type NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT,
  file_size_bytes INTEGER,
  file_mime_type VARCHAR(100),

  -- Processing status
  status import_job_status DEFAULT 'PENDING',

  -- Progress tracking
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  successful_imports INTEGER DEFAULT 0,
  failed_imports INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,

  -- Validation
  validation_errors JSONB DEFAULT '[]'::jsonb,  -- Array of validation errors
  column_mapping JSONB,                          -- Map Excel columns to DB fields

  -- Processing results
  errors JSONB DEFAULT '[]'::jsonb,              -- Array of row-level errors
  warnings JSONB DEFAULT '[]'::jsonb,            -- Array of warnings
  import_summary JSONB,                          -- Summary statistics

  -- Created entities (for rollback if needed)
  created_entity_ids UUID[] DEFAULT ARRAY[]::UUID[],

  -- User reference
  uploaded_by UUID NOT NULL REFERENCES users(id),
  cancelled_by UUID REFERENCES users(id),

  -- Metadata
  import_options JSONB DEFAULT '{}'::jsonb,      -- Import configuration
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

COMMENT ON TABLE excel_import_jobs IS 'Tracks Excel/CSV import jobs with progress and error details';
COMMENT ON COLUMN excel_import_jobs.job_number IS 'Unique job identifier (e.g., IMP-20260126-001)';
COMMENT ON COLUMN excel_import_jobs.validation_errors IS 'File-level validation errors (format, headers, etc.)';
COMMENT ON COLUMN excel_import_jobs.errors IS 'Row-level processing errors with line numbers';
COMMENT ON COLUMN excel_import_jobs.warnings IS 'Non-blocking warnings (e.g., duplicate emails handled)';
COMMENT ON COLUMN excel_import_jobs.column_mapping IS 'Maps Excel column names to database fields';
COMMENT ON COLUMN excel_import_jobs.created_entity_ids IS 'IDs of all entities created (for potential rollback)';
COMMENT ON COLUMN excel_import_jobs.import_options IS 'Configuration: {skipDuplicates, updateExisting, validateOnly, etc.}';

-- ============================================================================
-- IMPORT ROW ERRORS (Detailed error tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_row_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job reference
  job_id UUID NOT NULL REFERENCES excel_import_jobs(id) ON DELETE CASCADE,

  -- Row details
  row_number INTEGER NOT NULL,
  row_data JSONB,                -- Original row data

  -- Error details
  error_type VARCHAR(100) NOT NULL,  -- 'VALIDATION', 'DUPLICATE', 'MISSING_FIELD', 'FOREIGN_KEY', etc.
  error_message TEXT NOT NULL,
  error_field VARCHAR(100),          -- Field that caused the error

  -- Resolution
  is_resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_row_errors IS 'Detailed error tracking for each failed row';
COMMENT ON COLUMN import_row_errors.row_number IS 'Row number in the Excel file (1-indexed)';
COMMENT ON COLUMN import_row_errors.error_type IS 'Category of error (VALIDATION, DUPLICATE, MISSING_FIELD, etc.)';
COMMENT ON COLUMN import_row_errors.error_field IS 'Specific field that caused the error';

-- ============================================================================
-- IMPORT TEMPLATES (Define column mappings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template details
  template_name VARCHAR(255) NOT NULL,
  entity_type import_entity_type NOT NULL,

  -- Column mapping
  column_mapping JSONB NOT NULL,     -- {"Excel Column": "db_field"}
  required_columns TEXT[] NOT NULL,   -- Columns that must be present

  -- Validation rules
  validation_rules JSONB,             -- Custom validation rules
  transformation_rules JSONB,         -- Data transformation rules

  -- Template usage
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  description TEXT,
  created_by UUID REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_templates IS 'Reusable Excel import templates with column mappings';
COMMENT ON COLUMN import_templates.column_mapping IS 'Maps Excel column names to database field names';
COMMENT ON COLUMN import_templates.required_columns IS 'Excel columns that must be present';
COMMENT ON COLUMN import_templates.validation_rules IS 'Custom validation rules per field';
COMMENT ON COLUMN import_templates.transformation_rules IS 'Data transformation rules (trim, uppercase, date format, etc.)';

-- ============================================================================
-- IMPORT SCHEDULES (For recurring imports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS import_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Schedule details
  schedule_name VARCHAR(255) NOT NULL,
  entity_type import_entity_type NOT NULL,
  template_id UUID REFERENCES import_templates(id),

  -- File source
  file_source VARCHAR(100) NOT NULL,   -- 'FTP', 'SFTP', 'S3', 'GOOGLE_DRIVE', 'EMAIL'
  file_path TEXT,                       -- Path/URL to file
  file_pattern VARCHAR(255),            -- Filename pattern (e.g., "customers_*.xlsx")

  -- Schedule configuration
  cron_expression VARCHAR(100),         -- Cron expression for schedule
  is_active BOOLEAN DEFAULT true,

  -- Last run info
  last_run_at TIMESTAMPTZ,
  last_run_status import_job_status,
  last_job_id UUID REFERENCES excel_import_jobs(id),
  next_run_at TIMESTAMPTZ,

  -- Notifications
  notify_on_success BOOLEAN DEFAULT false,
  notify_on_failure BOOLEAN DEFAULT true,
  notification_emails TEXT[],

  -- Metadata
  created_by UUID REFERENCES users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_schedules IS 'Scheduled automatic imports from external sources';
COMMENT ON COLUMN import_schedules.file_source IS 'Source system: FTP, SFTP, S3, GOOGLE_DRIVE, EMAIL';
COMMENT ON COLUMN import_schedules.cron_expression IS 'Cron expression for scheduling (e.g., "0 0 * * *" for daily)';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Excel Import Jobs indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_number
  ON excel_import_jobs(job_number);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status
  ON excel_import_jobs(status);

CREATE INDEX IF NOT EXISTS idx_import_jobs_type
  ON excel_import_jobs(import_type);

CREATE INDEX IF NOT EXISTS idx_import_jobs_uploader
  ON excel_import_jobs(uploaded_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_pending
  ON excel_import_jobs(status, created_at)
  WHERE status IN ('PENDING', 'VALIDATING', 'PROCESSING');

-- Import Row Errors indexes
CREATE INDEX IF NOT EXISTS idx_row_errors_job
  ON import_row_errors(job_id, row_number);

CREATE INDEX IF NOT EXISTS idx_row_errors_type
  ON import_row_errors(error_type);

CREATE INDEX IF NOT EXISTS idx_row_errors_unresolved
  ON import_row_errors(job_id, is_resolved)
  WHERE is_resolved = false;

-- Import Templates indexes
CREATE INDEX IF NOT EXISTS idx_templates_entity_type
  ON import_templates(entity_type);

CREATE INDEX IF NOT EXISTS idx_templates_active
  ON import_templates(entity_type, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_templates_default
  ON import_templates(entity_type, is_default)
  WHERE is_default = true;

-- Import Schedules indexes
CREATE INDEX IF NOT EXISTS idx_schedules_active
  ON import_schedules(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_schedules_next_run
  ON import_schedules(next_run_at)
  WHERE is_active = true AND next_run_at IS NOT NULL;

-- ============================================================================
-- Updated At Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_import_jobs_updated_at ON excel_import_jobs;
CREATE TRIGGER trigger_import_jobs_updated_at
  BEFORE UPDATE ON excel_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_import_templates_updated_at ON import_templates;
CREATE TRIGGER trigger_import_templates_updated_at
  BEFORE UPDATE ON import_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_import_schedules_updated_at ON import_schedules;
CREATE TRIGGER trigger_import_schedules_updated_at
  BEFORE UPDATE ON import_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE excel_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_row_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_schedules ENABLE ROW LEVEL SECURITY;

-- Import Jobs policies (users can see their own jobs, admins see all)
DROP POLICY IF EXISTS "import_jobs_user_access" ON excel_import_jobs;
CREATE POLICY "import_jobs_user_access" ON excel_import_jobs
  FOR SELECT
  USING (
    uploaded_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "import_jobs_create" ON excel_import_jobs;
CREATE POLICY "import_jobs_create" ON excel_import_jobs
  FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

-- Row Errors policies (inherit from job access)
DROP POLICY IF EXISTS "row_errors_access" ON import_row_errors;
CREATE POLICY "row_errors_access" ON import_row_errors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM excel_import_jobs
      WHERE id = job_id AND (
        uploaded_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
      )
    )
  );

-- Templates policies (authenticated users can view, admins can modify)
DROP POLICY IF EXISTS "templates_view" ON import_templates;
CREATE POLICY "templates_view" ON import_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "templates_modify" ON import_templates;
CREATE POLICY "templates_modify" ON import_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Schedules policies (admin only)
DROP POLICY IF EXISTS "schedules_admin" ON import_schedules;
CREATE POLICY "schedules_admin" ON import_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grant access to service role
GRANT ALL ON excel_import_jobs TO service_role;
GRANT ALL ON import_row_errors TO service_role;
GRANT ALL ON import_templates TO service_role;
GRANT ALL ON import_schedules TO service_role;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to generate import job number
CREATE OR REPLACE FUNCTION generate_import_job_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  date_str VARCHAR(8);
  seq_num INTEGER;
  job_num VARCHAR(50);
BEGIN
  -- Format: IMP-YYYYMMDD-NNN
  date_str := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Get next sequence number for today
  SELECT COUNT(*) + 1 INTO seq_num
  FROM excel_import_jobs
  WHERE job_number LIKE 'IMP-' || date_str || '%';

  job_num := 'IMP-' || date_str || '-' || LPAD(seq_num::TEXT, 3, '0');

  RETURN job_num;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_import_job_number() IS 'Generate unique import job number in format IMP-YYYYMMDD-NNN';

-- Function to calculate import job progress percentage
CREATE OR REPLACE FUNCTION calculate_import_progress(job_id_param UUID)
RETURNS NUMERIC AS $$
DECLARE
  job_record RECORD;
  progress NUMERIC;
BEGIN
  SELECT total_rows, processed_rows INTO job_record
  FROM excel_import_jobs
  WHERE id = job_id_param;

  IF job_record.total_rows IS NULL OR job_record.total_rows = 0 THEN
    RETURN 0;
  END IF;

  progress := (job_record.processed_rows::NUMERIC / job_record.total_rows::NUMERIC) * 100;

  RETURN ROUND(progress, 2);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_import_progress(UUID) IS 'Calculate import job progress as percentage (0-100)';

-- Function to update import job progress
CREATE OR REPLACE FUNCTION update_import_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update status based on progress
  IF NEW.processed_rows >= NEW.total_rows AND NEW.total_rows > 0 THEN
    IF NEW.failed_imports = 0 THEN
      NEW.status := 'COMPLETED';
    ELSE
      NEW.status := 'COMPLETED_WITH_ERRORS';
    END IF;

    NEW.completed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_import_progress() IS 'Auto-update job status when all rows processed';

-- Apply progress tracking trigger
DROP TRIGGER IF EXISTS trigger_import_progress ON excel_import_jobs;
CREATE TRIGGER trigger_import_progress
  BEFORE UPDATE ON excel_import_jobs
  FOR EACH ROW
  WHEN (OLD.processed_rows IS DISTINCT FROM NEW.processed_rows)
  EXECUTE FUNCTION update_import_progress();

-- ============================================================================
-- Default Import Templates
-- ============================================================================

-- Customer import template
INSERT INTO import_templates (
  template_name,
  entity_type,
  column_mapping,
  required_columns,
  is_default,
  description
) VALUES (
  'Customer Import - Standard',
  'CUSTOMERS',
  '{
    "Company Name": "legal_name",
    "Trading Name": "trading_name",
    "Email": "primary_email",
    "Phone": "primary_phone",
    "GST Number": "gst_number",
    "PAN Number": "pan_number",
    "IEC Number": "iec_number",
    "Industry": "industry",
    "Customer Tier": "customer_tier",
    "Credit Terms": "credit_terms",
    "Billing Address": "billing_address",
    "Shipping Address": "shipping_address"
  }'::jsonb,
  ARRAY['Company Name', 'Email'],
  true,
  'Standard template for importing CRM customers from Excel'
) ON CONFLICT DO NOTHING;

-- Contact import template
INSERT INTO import_templates (
  template_name,
  entity_type,
  column_mapping,
  required_columns,
  is_default,
  description
) VALUES (
  'Contact Import - Standard',
  'CONTACTS',
  '{
    "Customer Code": "customer_code",
    "Full Name": "full_name",
    "Email": "email",
    "Phone": "phone",
    "Mobile": "mobile",
    "WhatsApp": "whatsapp",
    "Designation": "designation",
    "Department": "department",
    "Is Primary": "is_primary",
    "Is Decision Maker": "is_decision_maker"
  }'::jsonb,
  ARRAY['Customer Code', 'Full Name'],
  true,
  'Standard template for importing customer contacts from Excel'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- Complete
-- ============================================================================
