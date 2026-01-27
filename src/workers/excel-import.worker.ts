/**
 * Excel Import Worker
 *
 * Background worker that processes Excel/CSV file imports using BullMQ.
 * Supports importing customers, contacts, quotations, shipments, and leads.
 *
 * Features:
 * - Parse Excel/CSV files using XLSX library
 * - Validate data rows
 * - Batch insert into database
 * - Track progress and errors
 * - Update job status
 *
 * Queue: excel-import
 * Concurrency: 5
 */

import { Worker, Job, Queue } from 'bullmq';
// @ts-ignore - xlsx will be installed
import * as XLSX from 'xlsx';
import { supabase } from '../config/database.config';
import { logger } from '../utils/logger';
import { downloadFileFromStorage } from '../lib/storage';
import crmCustomerRepository from '../database/repositories/crm-customer.repository';
import quotationRepository from '../database/repositories/quotation.repository';
import shipmentRepository from '../database/repositories/shipment.repository';
import type { ImportEntityType } from '../types/excel-import.types';

// Redis connection configuration
const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

// Job data interface
interface ExcelImportJobData {
  jobId: string;
  fileUrl: string;
  fileName: string;
  importType: ImportEntityType;
  uploadedBy: string;
  columnMapping?: Record<string, string>;
  importOptions?: Record<string, any>;
}

// Row error interface
interface RowError {
  row_number: number;
  row_data: any;
  error_type: string;
  error_message: string;
  error_field: string | null;
}

// Excel Import Worker Class
class ExcelImportWorker {
  private worker: Worker;
  private queue: Queue;

  constructor() {
    // Create queue
    this.queue = new Queue('excel-import', {
      connection: REDIS_CONNECTION,
    });

    // Create worker
    this.worker = new Worker(
      'excel-import',
      async (job: Job<ExcelImportJobData>) => {
        return await this.processJob(job);
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 5,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      }
    );

    // Event handlers
    this.worker.on('completed', (job) => {
      logger.info('Excel import job completed', {
        jobId: job.id,
        data: job.returnvalue,
      });
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Excel import job failed', {
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      });
    });

    logger.info('Excel import worker started', {
      concurrency: 5,
      redis: {
        host: REDIS_CONNECTION.host,
        port: REDIS_CONNECTION.port,
      },
    });
  }

  /**
   * Process Excel import job
   */
  private async processJob(job: Job<ExcelImportJobData>): Promise<void> {
    const { jobId, fileUrl, fileName, importType, uploadedBy } = job.data;

    logger.info('Processing Excel import job', { jobId, fileName, importType });

    try {
      // Update job status to VALIDATING
      await this.updateJobStatus(jobId, 'VALIDATING');

      // Download file from storage
      const fileBuffer = await downloadFileFromStorage(fileUrl);

      // Parse Excel file
      const rows = await this.parseExcelFile(fileBuffer, fileName);

      logger.info('Parsed Excel file', {
        jobId,
        totalRows: rows.length,
      });

      // Update total rows
      await this.updateJobTotalRows(jobId, rows.length);

      // Update status to PROCESSING
      await this.updateJobStatus(jobId, 'PROCESSING');

      // Process rows based on import type
      const errors: RowError[] = [];
      let successfulImports = 0;
      let failedImports = 0;
      let skippedRows = 0;
      const createdEntityIds: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2; // +2 because Excel rows start at 1 and we skip header

        try {
          // Skip empty rows
          if (this.isEmptyRow(row)) {
            skippedRows++;
            continue;
          }

          // Process row based on import type
          const entityId = await this.processRow(importType, row, uploadedBy);
          createdEntityIds.push(entityId);
          successfulImports++;

          // Update progress
          await this.updateJobProgress(
            jobId,
            i + 1,
            successfulImports,
            failedImports,
            skippedRows
          );

          // Update job every 10 rows
          if ((i + 1) % 10 === 0) {
            await job.updateProgress((i + 1) / rows.length);
          }
        } catch (error: any) {
          failedImports++;

          // Capture row error
          errors.push({
            row_number: rowNumber,
            row_data: row,
            error_type: 'VALIDATION_ERROR',
            error_message: error.message || 'Unknown error',
            error_field: this.extractErrorField(error),
          });

          logger.warn('Row import failed', {
            jobId,
            rowNumber,
            error: error.message,
          });
        }
      }

      // Save row errors to database
      if (errors.length > 0) {
        await this.saveRowErrors(jobId, errors);
      }

      // Update final job status
      const finalStatus =
        failedImports > 0
          ? 'COMPLETED_WITH_ERRORS'
          : successfulImports > 0
          ? 'COMPLETED'
          : 'FAILED';

      await this.completeJob(jobId, finalStatus, createdEntityIds);

      logger.info('Excel import job processed', {
        jobId,
        status: finalStatus,
        successfulImports,
        failedImports,
        skippedRows,
      });
    } catch (error: any) {
      logger.error('Excel import job processing failed', {
        jobId,
        error: error.message,
        stack: error.stack,
      });

      await this.failJob(jobId, error.message);
      throw error;
    }
  }

  /**
   * Parse Excel/CSV file
   */
  private async parseExcelFile(buffer: Buffer, fileName: string): Promise<any[]> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const rows = XLSX.utils.sheet_to_json(sheet, {
        raw: false, // Parse dates and numbers
        defval: null, // Default value for empty cells
      });

      return rows;
    } catch (error: any) {
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  /**
   * Check if row is empty
   */
  private isEmptyRow(row: any): boolean {
    const values = Object.values(row);
    return values.every((val) => val === null || val === undefined || val === '');
  }

  /**
   * Process single row based on import type
   */
  private async processRow(
    importType: ImportEntityType,
    row: any,
    uploadedBy: string
  ): Promise<string> {
    switch (importType) {
      case 'CUSTOMERS':
        return await this.processCustomerRow(row);

      case 'CONTACTS':
        return await this.processContactRow(row);

      case 'QUOTATIONS':
        return await this.processQuotationRow(row, uploadedBy);

      case 'SHIPMENTS':
        return await this.processShipmentRow(row);

      case 'LEADS':
        return await this.processLeadRow(row);

      default:
        throw new Error(`Unsupported import type: ${importType}`);
    }
  }

  /**
   * Process customer row
   */
  private async processCustomerRow(row: any): Promise<string> {
    const data = {
      legal_name: row['Legal Name'] || row['Company Name'],
      trading_name: row['Trading Name'] || null,
      primary_email: row['Email'] || null,
      primary_phone: row['Phone'] || null,
      gst_number: row['GST Number'] || null,
      pan_number: row['PAN Number'] || null,
      iec_number: row['IEC Number'] || null,
      industry: row['Industry'] || null,
      customer_tier: (row['Tier'] || 'NEW') as any,
      status: (row['Status'] || 'LEAD') as any,
      credit_terms: (row['Credit Terms'] || 'ADVANCE') as any,
    };

    // Validate required fields
    if (!data.legal_name) {
      throw new Error('Legal Name is required');
    }

    const customer = await crmCustomerRepository.create(data);
    return customer.id;
  }

  /**
   * Process contact row
   */
  private async processContactRow(row: any): Promise<string> {
    const customerId = row['Customer ID'];
    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    const data = {
      customer_id: customerId,
      full_name: row['Full Name'] || row['Name'],
      designation: row['Designation'] || null,
      department: row['Department'] || null,
      email: row['Email'] || null,
      phone: row['Phone'] || null,
      mobile: row['Mobile'] || null,
      is_primary: row['Is Primary']?.toLowerCase() === 'yes',
    };

    if (!data.full_name) {
      throw new Error('Full Name is required');
    }

    const { data: contact, error } = await supabase
      .from('crm_contacts')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return contact.id;
  }

  /**
   * Process quotation row
   */
  private async processQuotationRow(row: any, uploadedBy: string): Promise<string> {
    const data = {
      customer_id: row['Customer ID'],
      customer_name: row['Customer Name'],
      customer_email: row['Customer Email'] || null,
      shipment_type: row['Shipment Type'],
      origin_location: row['Origin'] || null,
      destination_location: row['Destination'] || null,
      total_cost: parseFloat(row['Total Cost']),
      currency: row['Currency'] || 'USD',
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      created_by: uploadedBy,
    };

    if (!data.customer_id || !data.customer_name || !data.shipment_type) {
      throw new Error('Customer ID, Name, and Shipment Type are required');
    }

    const quotation = await quotationRepository.create(data);
    return quotation.id;
  }

  /**
   * Process shipment row
   */
  private async processShipmentRow(row: any): Promise<string> {
    const data = {
      customer_id: row['Customer ID'],
      shipment_type: row['Shipment Type'],
      current_stage: row['Current Stage'] || 'BOOKING',
      origin_country: row['Origin Country'] || null,
      destination_country: row['Destination Country'] || null,
      service_type: row['Service Type'] || 'STANDARD',
    };

    if (!data.customer_id || !data.shipment_type) {
      throw new Error('Customer ID and Shipment Type are required');
    }

    const shipment = await shipmentRepository.create(data);
    return shipment.id;
  }

  /**
   * Process lead row (same as customer but with LEAD status)
   */
  private async processLeadRow(row: any): Promise<string> {
    const data = {
      legal_name: row['Company Name'] || row['Legal Name'],
      primary_email: row['Email'] || null,
      primary_phone: row['Phone'] || null,
      lead_source: (row['Lead Source'] || 'IMPORT') as any,
      lead_notes: row['Notes'] || null,
      status: 'LEAD' as any,
      customer_tier: 'NEW' as any,
    };

    if (!data.legal_name) {
      throw new Error('Company Name is required');
    }

    const customer = await crmCustomerRepository.create(data);
    return customer.id;
  }

  /**
   * Extract error field from error message
   */
  private extractErrorField(error: any): string | null {
    if (error.constraint?.includes('email')) return 'email';
    if (error.constraint?.includes('gst')) return 'gst_number';
    if (error.message?.includes('Legal Name')) return 'legal_name';
    return null;
  }

  /**
   * Update job status
   */
  private async updateJobStatus(jobId: string, status: string): Promise<void> {
    await supabase
      .from('excel_import_jobs')
      .update({
        status,
        ...(status === 'PROCESSING' && { started_at: new Date().toISOString() }),
      })
      .eq('id', jobId);
  }

  /**
   * Update job total rows
   */
  private async updateJobTotalRows(jobId: string, totalRows: number): Promise<void> {
    await supabase
      .from('excel_import_jobs')
      .update({ total_rows: totalRows })
      .eq('id', jobId);
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    processedRows: number,
    successfulImports: number,
    failedImports: number,
    skippedRows: number
  ): Promise<void> {
    await supabase
      .from('excel_import_jobs')
      .update({
        processed_rows: processedRows,
        successful_imports: successfulImports,
        failed_imports: failedImports,
        skipped_rows: skippedRows,
      })
      .eq('id', jobId);
  }

  /**
   * Save row errors
   */
  private async saveRowErrors(jobId: string, errors: RowError[]): Promise<void> {
    const records = errors.map((error) => ({
      job_id: jobId,
      ...error,
    }));

    await supabase.from('import_row_errors').insert(records);
  }

  /**
   * Complete job
   */
  private async completeJob(
    jobId: string,
    status: string,
    createdEntityIds: string[]
  ): Promise<void> {
    await supabase
      .from('excel_import_jobs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        created_entity_ids: createdEntityIds,
      })
      .eq('id', jobId);
  }

  /**
   * Fail job
   */
  private async failJob(jobId: string, errorMessage: string): Promise<void> {
    await supabase
      .from('excel_import_jobs')
      .update({
        status: 'FAILED',
        errors: [{ message: errorMessage, timestamp: new Date().toISOString() }],
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }

  /**
   * Add job to queue
   */
  async addJob(data: ExcelImportJobData): Promise<Job> {
    return await this.queue.add('process-import', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  /**
   * Close worker and queue
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.info('Excel import worker closed');
  }
}

// Export singleton instance
export const excelImportWorker = new ExcelImportWorker();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Excel import worker...');
  await excelImportWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Excel import worker...');
  await excelImportWorker.close();
  process.exit(0);
});
