/**
 * Excel Import API Endpoints
 *
 * Handles Excel/CSV file uploads and import job management.
 *
 * Routes:
 * - POST   /upload              Upload Excel file and start import
 * - GET    /jobs                List all import jobs
 * - GET    /jobs/:id            Get import job by ID
 * - GET    /jobs/:id/errors     Get row errors for import job
 * - POST   /jobs/:id/cancel     Cancel import job
 * - GET    /stats               Get import statistics for user
 *
 * Authentication: Required (Supabase JWT)
 * Authorization: User must own the import job
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../../config/database.config';
import { authenticateRequest, type AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../utils/logger';
import { uploadFileToStorage } from '../../../lib/storage';
import { excelImportWorker } from '../../../workers/excel-import.worker';
import type {
  ExcelImportJob,
  ImportRowError,
  ImportEntityType,
  ImportJobStatus,
  ImportJobFilters,
} from '../../../types/excel-import.types';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .xlsx, .xls, and .csv files are allowed.'));
    }
  },
});

/**
 * POST /api/v1/excel-import/upload
 * Upload Excel file and start import job
 */
router.post(
  '/upload',
  authenticateRequest,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { import_type, column_mapping, import_options, notes } = req.body;
      const file = req.file;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ success: false, error: 'User not authenticated' });
        return;
      }

      if (!file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      if (!import_type) {
        res.status(400).json({ success: false, error: 'import_type is required' });
        return;
      }

      // Validate import type
      const validTypes: ImportEntityType[] = [
        'CUSTOMERS',
        'CONTACTS',
        'QUOTATIONS',
        'SHIPMENTS',
        'LEADS',
      ];
      if (!validTypes.includes(import_type)) {
        res.status(400).json({
          success: false,
          error: `Invalid import_type. Must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      logger.info('Excel file upload started', {
        userId,
        fileName: file.originalname,
        size: file.size,
        importType: import_type,
      });

      // Generate unique file path
      const timestamp = Date.now();
      const uniqueId = uuidv4().split('-')[0];
      const extension = file.originalname.split('.').pop();
      const storagePath = `${import_type.toLowerCase()}/${timestamp}-${uniqueId}.${extension}`;

      // Upload file to storage
      const fileUrl = await uploadFileToStorage(file.buffer, storagePath, 'excel-imports');

      // Generate job number
      const jobNumber = await generateJobNumber(import_type);

      // Create import job record
      const { data: job, error: insertError } = await supabase
        .from('excel_import_jobs')
        .insert({
          job_number: jobNumber,
          import_type,
          file_name: file.originalname,
          file_url: fileUrl,
          file_size_bytes: file.size,
          file_mime_type: file.mimetype,
          status: 'PENDING',
          uploaded_by: userId,
          column_mapping: column_mapping ? JSON.parse(column_mapping) : null,
          import_options: import_options ? JSON.parse(import_options) : {},
          notes: notes || null,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Database error: ${insertError.message}`);
      }

      // Add job to worker queue
      await excelImportWorker.addJob({
        jobId: job.id,
        fileUrl: fileUrl,
        fileName: file.originalname,
        importType: import_type,
        uploadedBy: userId,
        columnMapping: column_mapping ? JSON.parse(column_mapping) : undefined,
        importOptions: import_options ? JSON.parse(import_options) : undefined,
      });

      logger.info('Excel import job created', {
        jobId: job.id,
        jobNumber,
        userId,
      });

      res.status(201).json({
        success: true,
        data: job as ExcelImportJob,
        message: 'File uploaded successfully. Import started.',
      });
    } catch (error: any) {
      logger.error('Excel upload failed', {
        error: error.message,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload file',
      });
    }
  }
);

/**
 * GET /api/v1/excel-import/jobs
 * Get all import jobs with filters
 */
router.get('/jobs', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      status,
      import_type,
      dateFrom,
      dateTo,
      page = '1',
      limit = '20',
    } = req.query as any;

    let query = supabase
      .from('excel_import_jobs')
      .select('*', { count: 'exact' })
      .eq('uploaded_by', userId!)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) {
      const statusArray = status.split(',');
      query = query.in('status', statusArray);
    }

    if (import_type) {
      query = query.eq('import_type', import_type);
    }

    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }

    if (dateTo) {
      query = query.lte('created_at', new Date(dateTo).toISOString());
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    res.json({
      success: true,
      data: data as ExcelImportJob[],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limitNum),
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch import jobs', {
      error: error.message,
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch import jobs',
    });
  }
});

/**
 * GET /api/v1/excel-import/jobs/:id
 * Get import job by ID
 */
router.get('/jobs/:id', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data, error } = await supabase
      .from('excel_import_jobs')
      .select('*')
      .eq('id', id)
      .eq('uploaded_by', userId!)
      .single();

    if (error || !data) {
      res.status(404).json({
        success: false,
        error: 'Import job not found',
      });
      return;
    }

    res.json({
      success: true,
      data: data as ExcelImportJob,
    });
  } catch (error: any) {
    logger.error('Failed to fetch import job', {
      error: error.message,
      jobId: req.params.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch import job',
    });
  }
});

/**
 * GET /api/v1/excel-import/jobs/:id/errors
 * Get row errors for import job
 */
router.get('/jobs/:id/errors', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Verify job ownership
    const { data: job } = await supabase
      .from('excel_import_jobs')
      .select('id')
      .eq('id', id)
      .eq('uploaded_by', userId!)
      .single();

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Import job not found',
      });
      return;
    }

    // Fetch errors
    const { data, error, count } = await supabase
      .from('import_row_errors')
      .select('*', { count: 'exact' })
      .eq('job_id', id)
      .order('row_number', { ascending: true });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    res.json({
      success: true,
      data: data as ImportRowError[],
      count: count || 0,
    });
  } catch (error: any) {
    logger.error('Failed to fetch import errors', {
      error: error.message,
      jobId: req.params.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch import errors',
    });
  }
});

/**
 * POST /api/v1/excel-import/jobs/:id/cancel
 * Cancel import job
 */
router.post('/jobs/:id/cancel', authenticateRequest, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Verify job ownership and current status
    const { data: job, error: fetchError } = await supabase
      .from('excel_import_jobs')
      .select('*')
      .eq('id', id)
      .eq('uploaded_by', userId!)
      .single();

    if (fetchError || !job) {
      res.status(404).json({
        success: false,
        error: 'Import job not found',
      });
      return;
    }

    // Check if job can be cancelled
    const cancellableStatuses: ImportJobStatus[] = [
      'PENDING',
      'VALIDATING',
      'PROCESSING',
    ];

    if (!cancellableStatuses.includes(job.status)) {
      res.status(400).json({
        success: false,
        error: `Cannot cancel job with status: ${job.status}`,
      });
      return;
    }

    // Update job status
    const { data: updatedJob, error: updateError } = await supabase
      .from('excel_import_jobs')
      .update({
        status: 'CANCELLED',
        cancelled_by: userId,
        cancelled_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Database error: ${updateError.message}`);
    }

    logger.info('Import job cancelled', { jobId: id, userId });

    res.json({
      success: true,
      data: updatedJob as ExcelImportJob,
      message: 'Import job cancelled successfully',
    });
  } catch (error: any) {
    logger.error('Failed to cancel import job', {
      error: error.message,
      jobId: req.params.id,
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel import job',
    });
  }
});

/**
 * Generate unique job number
 */
async function generateJobNumber(importType: ImportEntityType): Promise<string> {
  const prefix = importType.substring(0, 3).toUpperCase();
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');

  // Get count of jobs today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('excel_import_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('import_type', importType)
    .gte('created_at', startOfDay.toISOString());

  const sequence = String((count || 0) + 1).padStart(3, '0');

  return `IMP-${prefix}-${dateStr}-${sequence}`;
}

export default router;
