/**
 * Storage Utilities
 *
 * Handles file operations for Azure Blob Storage or Supabase Storage.
 * Used primarily for Excel import file downloads and document storage.
 *
 * Features:
 * - Download files from storage
 * - Upload files to storage
 * - Generate signed URLs
 * - Delete files
 *
 * @example
 * ```typescript
 * // Download file
 * const buffer = await downloadFileFromStorage(fileUrl);
 *
 * // Upload file
 * const url = await uploadFileToStorage(buffer, 'imports/file.xlsx');
 * ```
 */

import { supabase } from '../config/database.config';
import { logger } from '../utils/logger';

/**
 * Download file from Supabase Storage
 *
 * @param fileUrl - Full URL or storage path
 * @returns Buffer containing file data
 */
export async function downloadFileFromStorage(fileUrl: string): Promise<Buffer> {
  try {
    // Extract bucket and path from URL
    const { bucket, path } = parseStorageUrl(fileUrl);

    logger.info('Downloading file from storage', { bucket, path });

    // Download file
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      throw new Error(`Storage download error: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data received from storage');
    }

    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.info('File downloaded successfully', {
      bucket,
      path,
      size: buffer.length,
    });

    return buffer;
  } catch (error: any) {
    logger.error('Failed to download file from storage', {
      fileUrl,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Upload file to Supabase Storage
 *
 * @param buffer - File data
 * @param path - Storage path (e.g., 'imports/file.xlsx')
 * @param bucket - Storage bucket name (default: 'excel-imports')
 * @returns Public URL of uploaded file
 */
export async function uploadFileToStorage(
  buffer: Buffer,
  path: string,
  bucket: string = 'excel-imports'
): Promise<string> {
  try {
    logger.info('Uploading file to storage', { bucket, path, size: buffer.length });

    // Upload file
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: getContentType(path),
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      throw new Error(`Storage upload error: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

    logger.info('File uploaded successfully', {
      bucket,
      path: data.path,
      url: urlData.publicUrl,
    });

    return urlData.publicUrl;
  } catch (error: any) {
    logger.error('Failed to upload file to storage', {
      bucket,
      path,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Generate signed URL for temporary file access
 *
 * @param path - Storage path
 * @param bucket - Storage bucket name
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL
 */
export async function getSignedUrl(
  path: string,
  bucket: string = 'excel-imports',
  expiresIn: number = 3600
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    if (!data?.signedUrl) {
      throw new Error('No signed URL returned');
    }

    return data.signedUrl;
  } catch (error: any) {
    logger.error('Failed to generate signed URL', {
      bucket,
      path,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Delete file from storage
 *
 * @param path - Storage path
 * @param bucket - Storage bucket name
 */
export async function deleteFileFromStorage(
  path: string,
  bucket: string = 'excel-imports'
): Promise<void> {
  try {
    logger.info('Deleting file from storage', { bucket, path });

    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      throw new Error(`Storage delete error: ${error.message}`);
    }

    logger.info('File deleted successfully', { bucket, path });
  } catch (error: any) {
    logger.error('Failed to delete file from storage', {
      bucket,
      path,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Parse storage URL to extract bucket and path
 *
 * @param url - Storage URL (public or full URL)
 * @returns Bucket name and file path
 */
function parseStorageUrl(url: string): { bucket: string; path: string } {
  try {
    // Handle Supabase public URL format:
    // https://PROJECT.supabase.co/storage/v1/object/public/BUCKET/PATH
    if (url.includes('/storage/v1/object/public/')) {
      const parts = url.split('/storage/v1/object/public/');
      const [bucket, ...pathParts] = parts[1].split('/');
      return {
        bucket,
        path: pathParts.join('/'),
      };
    }

    // Handle direct path format: bucket/path/to/file.xlsx
    const [bucket, ...pathParts] = url.split('/');
    return {
      bucket,
      path: pathParts.join('/'),
    };
  } catch (error) {
    throw new Error(`Invalid storage URL format: ${url}`);
  }
}

/**
 * Get content type from file extension
 *
 * @param filename - File name or path
 * @returns MIME type
 */
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const contentTypes: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    txt: 'text/plain',
  };

  return contentTypes[ext || ''] || 'application/octet-stream';
}

/**
 * List files in bucket
 *
 * @param bucket - Storage bucket name
 * @param prefix - Path prefix for filtering
 * @param limit - Maximum number of files to return
 * @returns List of file metadata
 */
export async function listFiles(
  bucket: string = 'excel-imports',
  prefix?: string,
  limit: number = 100
): Promise<any[]> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      sortBy: { column: 'created_at', order: 'desc' },
    });

    if (error) {
      throw new Error(`Storage list error: ${error.message}`);
    }

    return data || [];
  } catch (error: any) {
    logger.error('Failed to list files from storage', {
      bucket,
      prefix,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check if file exists in storage
 *
 * @param path - Storage path
 * @param bucket - Storage bucket name
 * @returns True if file exists
 */
export async function fileExists(
  path: string,
  bucket: string = 'excel-imports'
): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(path);

    if (error) {
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    return false;
  }
}
