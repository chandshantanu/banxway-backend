import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

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

export interface CreateImportJobRequest {
  import_type: ImportEntityType;
  file_name: string;
  file_url?: string;
  file_size_bytes?: number;
  file_mime_type?: string;
  column_mapping?: any;
  import_options?: any;
  uploaded_by: string;
  notes?: string;
}

export interface UpdateImportJobRequest {
  status?: ImportJobStatus;
  total_rows?: number;
  processed_rows?: number;
  successful_imports?: number;
  failed_imports?: number;
  skipped_rows?: number;
  validation_errors?: any[];
  errors?: any[];
  warnings?: any[];
  import_summary?: any;
  created_entity_ids?: string[];
  started_at?: string;
  completed_at?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  notes?: string;
}

export interface CreateRowErrorRequest {
  job_id: string;
  row_number: number;
  row_data?: any;
  error_type: string;
  error_message: string;
  error_field?: string;
}

export interface ImportJobFilters {
  status?: ImportJobStatus[];
  import_type?: ImportEntityType;
  uploaded_by?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Repository Class
// ============================================================================

export class ExcelImportRepository {
  /**
   * Check if table exists (for graceful degradation)
   */
  private isTableMissingError(error: any): boolean {
    return (
      error.code === '42P01' ||
      (error.message?.includes('excel_import_jobs') && error.message?.includes('not found')) ||
      error.message?.includes('schema cache')
    );
  }

  /**
   * Find all import jobs with filters and pagination
   */
  async findAll(
    filters: ImportJobFilters = {},
    pagination: PaginationParams = {}
  ): Promise<{
    jobs: ExcelImportJob[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { status, import_type, uploaded_by, dateFrom, dateTo } = filters;

    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = supabaseAdmin.from('excel_import_jobs').select('*', { count: 'exact' });

    // Apply filters
    if (status && status.length > 0) {
      query = query.in('status', status);
    }

    if (import_type) {
      query = query.eq('import_type', import_type);
    }

    if (uploaded_by) {
      query = query.eq('uploaded_by', uploaded_by);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo.toISOString());
    }

    // Pagination and sorting
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Excel import jobs table not found - returning empty array');
        return {
          jobs: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }

      logger.error('Error fetching import jobs', { error: error.message });
      throw error;
    }

    return {
      jobs: data as ExcelImportJob[],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Find import job by ID
   */
  async findById(id: string): Promise<ExcelImportJob | null> {
    const { data, error } = await supabaseAdmin
      .from('excel_import_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Excel import jobs table not found - returning null');
        return null;
      }

      logger.error('Error fetching import job', { id, error: error.message });
      throw error;
    }

    return data as ExcelImportJob;
  }

  /**
   * Find import job by job number
   */
  async findByJobNumber(jobNumber: string): Promise<ExcelImportJob | null> {
    const { data, error } = await supabaseAdmin
      .from('excel_import_jobs')
      .select('*')
      .eq('job_number', jobNumber)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;

      if (this.isTableMissingError(error)) {
        logger.debug('Excel import jobs table not found - returning null');
        return null;
      }

      logger.error('Error fetching import job by number', { jobNumber, error: error.message });
      throw error;
    }

    return data as ExcelImportJob;
  }

  /**
   * Create new import job
   */
  async create(jobData: CreateImportJobRequest): Promise<ExcelImportJob> {
    // Generate job number using database function
    const { data: jobNumber, error: jobNumError } = await supabaseAdmin.rpc(
      'generate_import_job_number'
    );

    if (jobNumError) {
      logger.error('Error generating job number', { error: jobNumError.message });
      throw jobNumError;
    }

    const newJob = {
      ...jobData,
      job_number: jobNumber,
      status: 'PENDING' as const,
      total_rows: 0,
      processed_rows: 0,
      successful_imports: 0,
      failed_imports: 0,
      skipped_rows: 0,
      validation_errors: [],
      errors: [],
      warnings: [],
      created_entity_ids: [],
      import_options: jobData.import_options || {},
    };

    const { data, error } = await supabaseAdmin
      .from('excel_import_jobs')
      .insert(newJob)
      .select()
      .single();

    if (error) {
      logger.error('Error creating import job', { error: error.message });
      throw error;
    }

    logger.info('Import job created', { id: data.id, job_number: data.job_number });
    return data as ExcelImportJob;
  }

  /**
   * Update import job
   */
  async update(id: string, updates: UpdateImportJobRequest): Promise<ExcelImportJob> {
    const { data, error } = await supabaseAdmin
      .from('excel_import_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating import job', { id, error: error.message });
      throw error;
    }

    logger.info('Import job updated', { id, status: data.status });
    return data as ExcelImportJob;
  }

  /**
   * Update import progress
   */
  async updateProgress(
    id: string,
    processed: number,
    successful: number,
    failed: number
  ): Promise<ExcelImportJob> {
    return this.update(id, {
      processed_rows: processed,
      successful_imports: successful,
      failed_imports: failed,
    });
  }

  /**
   * Mark job as started
   */
  async markStarted(id: string): Promise<ExcelImportJob> {
    return this.update(id, {
      status: 'PROCESSING',
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Mark job as completed
   */
  async markCompleted(id: string, hasErrors: boolean = false): Promise<ExcelImportJob> {
    return this.update(id, {
      status: hasErrors ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Mark job as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<ExcelImportJob> {
    return this.update(id, {
      status: 'FAILED',
      errors: [{ message: errorMessage, timestamp: new Date().toISOString() }],
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Cancel job
   */
  async cancel(id: string, userId: string): Promise<ExcelImportJob> {
    return this.update(id, {
      status: 'CANCELLED',
      cancelled_by: userId,
      cancelled_at: new Date().toISOString(),
    });
  }

  /**
   * Delete import job
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('excel_import_jobs').delete().eq('id', id);

    if (error) {
      logger.error('Error deleting import job', { id, error: error.message });
      throw error;
    }

    logger.info('Import job deleted', { id });
  }

  /**
   * Add row error
   */
  async addRowError(errorData: CreateRowErrorRequest): Promise<ImportRowError> {
    const newError = {
      ...errorData,
      is_resolved: false,
    };

    const { data, error } = await supabaseAdmin
      .from('import_row_errors')
      .insert(newError)
      .select()
      .single();

    if (error) {
      logger.error('Error adding row error', { error: error.message });
      throw error;
    }

    return data as ImportRowError;
  }

  /**
   * Get row errors for job
   */
  async getRowErrors(jobId: string): Promise<ImportRowError[]> {
    const { data, error } = await supabaseAdmin
      .from('import_row_errors')
      .select('*')
      .eq('job_id', jobId)
      .order('row_number', { ascending: true });

    if (error) {
      logger.error('Error fetching row errors', { jobId, error: error.message });
      throw error;
    }

    return data as ImportRowError[];
  }

  /**
   * Get job progress percentage
   */
  async getProgress(id: string): Promise<number> {
    const job = await this.findById(id);
    if (!job || job.total_rows === 0) return 0;

    return Math.round((job.processed_rows / job.total_rows) * 100);
  }

  /**
   * Get active import jobs (PENDING, VALIDATING, PROCESSING)
   */
  async getActiveJobs(): Promise<ExcelImportJob[]> {
    const { data, error } = await supabaseAdmin
      .from('excel_import_jobs')
      .select('*')
      .in('status', ['PENDING', 'VALIDATING', 'PROCESSING'])
      .order('created_at', { ascending: true });

    if (error) {
      if (this.isTableMissingError(error)) {
        logger.debug('Excel import jobs table not found - returning empty array');
        return [];
      }

      logger.error('Error fetching active jobs', { error: error.message });
      throw error;
    }

    return data as ExcelImportJob[];
  }

  /**
   * Get import statistics for user
   */
  async getUserStats(userId: string): Promise<{
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    total_imported_rows: number;
  }> {
    const { data, error } = await supabaseAdmin
      .from('excel_import_jobs')
      .select('status, successful_imports')
      .eq('uploaded_by', userId);

    if (error) {
      logger.error('Error fetching user stats', { userId, error: error.message });
      throw error;
    }

    const jobs = data as ExcelImportJob[];

    return {
      total_jobs: jobs.length,
      completed_jobs: jobs.filter((j) => j.status === 'COMPLETED').length,
      failed_jobs: jobs.filter((j) => j.status === 'FAILED').length,
      total_imported_rows: jobs.reduce((sum, j) => sum + (j.successful_imports || 0), 0),
    };
  }
}

export default new ExcelImportRepository();
