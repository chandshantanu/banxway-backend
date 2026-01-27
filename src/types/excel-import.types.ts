/**
 * Excel Import Type Definitions
 *
 * TypeScript interfaces for Excel/CSV import functionality.
 */

export type ImportJobStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'CANCELLED';

export type ImportEntityType = 'CUSTOMERS' | 'CONTACTS' | 'QUOTATIONS' | 'SHIPMENTS' | 'LEADS';

export interface ExcelImportJob {
  id: string;
  job_number: string;
  import_type: ImportEntityType;
  file_name: string;
  file_url: string | null;
  file_size_bytes: number | null;
  file_mime_type: string | null;
  status: ImportJobStatus;
  total_rows: number;
  processed_rows: number;
  successful_imports: number;
  failed_imports: number;
  skipped_rows: number;
  validation_errors: any[];
  column_mapping: any | null;
  errors: any[];
  warnings: any[];
  import_summary: any | null;
  created_entity_ids: string[];
  uploaded_by: string;
  cancelled_by: string | null;
  import_options: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface ImportRowError {
  id: string;
  job_id: string;
  row_number: number;
  row_data: any | null;
  error_type: string;
  error_message: string;
  error_field: string | null;
  is_resolved: boolean;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface UploadExcelRequest {
  file: Express.Multer.File;
  import_type: ImportEntityType;
  column_mapping?: any;
  import_options?: any;
  notes?: string;
}

export interface ImportJobFilters {
  status?: ImportJobStatus[];
  import_type?: ImportEntityType;
  uploaded_by?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}
