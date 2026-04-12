/**
 * Azure Blob Storage Service
 * Handles file uploads for email attachments, documents, transcriptions, and exports.
 *
 * Containers:
 *   - email-attachments  → email attachment files
 *   - documents          → extracted documents (PDF, Excel, Word)
 *   - transcriptions     → call transcription audio/text
 *   - exports            → generated export files
 */

import { BlobServiceClient, BlockBlobClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from '@azure/storage-blob';
import { logger } from '../../utils/logger';

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'banxwaystorage';
const ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY || '';

export const CONTAINERS = {
  EMAIL_ATTACHMENTS: 'email-attachments',
  DOCUMENTS: 'documents',
  TRANSCRIPTIONS: 'transcriptions',
  EXPORTS: 'exports',
} as const;

type ContainerName = typeof CONTAINERS[keyof typeof CONTAINERS];

export class BlobStorageService {
  private client: BlobServiceClient | null = null;

  private getClient(): BlobServiceClient {
    if (!this.client) {
      if (!CONNECTION_STRING) {
        throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
      }
      this.client = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
    }
    return this.client;
  }

  /**
   * Upload a buffer/stream to Azure Blob Storage.
   * Returns the public URL of the uploaded blob.
   */
  async upload(
    container: ContainerName,
    blobName: string,
    data: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const client = this.getClient();
    const containerClient = client.getContainerClient(container);
    const blockBlobClient: BlockBlobClient = containerClient.getBlockBlobClient(blobName);

    const options = {
      blobHTTPHeaders: { blobContentType: contentType },
      metadata,
    };

    await blockBlobClient.uploadData(data, options);

    logger.info('Blob uploaded', { container, blobName, contentType });
    return blockBlobClient.url;
  }

  /**
   * Upload a file from a URL (e.g., email attachment fetched from IMAP).
   */
  async uploadFromUrl(
    container: ContainerName,
    blobName: string,
    url: string,
    contentType: string
  ): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch file from URL: ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return this.upload(container, blobName, buffer, contentType);
  }

  /**
   * Download a blob as a Buffer.
   */
  async download(container: ContainerName, blobName: string): Promise<Buffer> {
    const client = this.getClient();
    const blockBlobClient = client.getContainerClient(container).getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.downloadToBuffer();
    return downloadResponse;
  }

  /**
   * Delete a blob.
   */
  async delete(container: ContainerName, blobName: string): Promise<void> {
    const client = this.getClient();
    await client.getContainerClient(container).getBlockBlobClient(blobName).deleteIfExists();
    logger.info('Blob deleted', { container, blobName });
  }

  /**
   * Generate a time-limited SAS URL for secure access to a private blob.
   */
  generateSasUrl(container: ContainerName, blobName: string, expiresInMinutes = 60): string {
    const accountKey = ACCOUNT_KEY || this.extractKeyFromConnectionString();
    if (!accountKey) throw new Error('Storage account key not available for SAS generation');

    const sharedKeyCredential = new StorageSharedKeyCredential(ACCOUNT_NAME, accountKey);
    const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      sharedKeyCredential
    ).toString();

    return `https://${ACCOUNT_NAME}.blob.core.windows.net/${container}/${blobName}?${sasToken}`;
  }

  /**
   * Check if the storage service is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.getContainerClient(CONTAINERS.DOCUMENTS).exists();
      return true;
    } catch {
      return false;
    }
  }

  private extractKeyFromConnectionString(): string {
    const match = CONNECTION_STRING.match(/AccountKey=([^;]+)/);
    return match ? match[1] : '';
  }

  /**
   * Build a deterministic blob name for an email attachment.
   */
  static emailAttachmentName(messageId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${messageId}/${Date.now()}_${safe}`;
  }

  /**
   * Build a deterministic blob name for a document extraction.
   */
  static documentName(threadId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${threadId}/${Date.now()}_${safe}`;
  }

  /**
   * Build a blob name for a call transcription.
   */
  static transcriptionName(callId: string, ext = 'txt'): string {
    return `${callId}/${Date.now()}.${ext}`;
  }
}

export const blobStorage = new BlobStorageService();
