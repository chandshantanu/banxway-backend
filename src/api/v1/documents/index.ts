/**
 * Document Management API
 * Upload, list, delete documents. Triggers L3 document extraction agents.
 */

import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateRequest, requirePermission, AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';
import { getDocumentQueue } from '../../../config/redis.config';
import { AGENTBUILDER_CONFIG } from '../../../services/agentbuilder/mcp-config';

const router = Router();
router.use(authenticateRequest);

// Configure multer for file uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/csv',
      'image/png',
      'image/jpeg',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Map file extension to agent
function getExtractorAgentId(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const agents = AGENTBUILDER_CONFIG.agents;
  switch (ext) {
    case '.pdf': return agents.pdfExtractor;
    case '.xlsx': case '.xls': case '.csv': return agents.excelExtractor;
    case '.docx': case '.doc': return agents.wordExtractor;
    default: return agents.pdfExtractor; // fallback to PDF/OCR
  }
}

/**
 * GET /api/v1/documents
 * List documents for a thread or shipment
 */
router.get('/', requirePermission(Permission.VIEW_DOCUMENTS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { thread_id, shipment_id, page = '1', limit = '20' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabaseAdmin
      .from('document_extractions')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (thread_id) query = query.eq('thread_id', thread_id);
    if (shipment_id) query = query.eq('shipment_id', shipment_id);

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        return res.json({ success: true, data: [], count: 0 });
      }
      throw error;
    }

    res.json({ success: true, data: data || [], count: data?.length || 0 });
  } catch (error: any) {
    logger.error('Error listing documents', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

/**
 * POST /api/v1/documents/upload
 * Upload a document and queue for extraction
 */
router.post('/upload', requirePermission(Permission.UPLOAD_DOCUMENTS), upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const { thread_id, shipment_id } = req.body;
    const uploaderId = req.user?.id;

    // Store document metadata in DB
    const { data: doc, error } = await supabaseAdmin
      .from('document_extractions')
      .insert({
        filename: file.originalname,
        content_type: file.mimetype,
        file_size: file.size,
        thread_id: thread_id || null,
        shipment_id: shipment_id || null,
        uploaded_by: uploaderId,
        status: 'PENDING',
        agent_id: getExtractorAgentId(file.originalname),
      })
      .select()
      .single();

    if (error) throw error;

    // Queue document for processing
    try {
      const documentQueue = getDocumentQueue();
      await documentQueue.add('extract-document', {
        documentId: doc.id,
        filename: file.originalname,
        contentType: file.mimetype,
        fileSize: file.size,
        fileBuffer: file.buffer.toString('base64'),
        threadId: thread_id,
        shipmentId: shipment_id,
        agentId: getExtractorAgentId(file.originalname),
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });

      logger.info('Document queued for extraction', {
        documentId: doc.id,
        filename: file.originalname,
        agentId: getExtractorAgentId(file.originalname),
      });
    } catch (queueError: any) {
      logger.warn('Failed to queue document for extraction (Redis may be down)', {
        error: queueError.message,
        documentId: doc.id,
      });
    }

    res.status(201).json({ success: true, data: doc });
  } catch (error: any) {
    logger.error('Error uploading document', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to upload document' });
  }
});

/**
 * GET /api/v1/documents/:id
 * Get document with extraction results
 */
router.get('/:id', requirePermission(Permission.VIEW_DOCUMENTS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('document_extractions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      throw error;
    }

    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching document', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to fetch document' });
  }
});

/**
 * DELETE /api/v1/documents/:id
 */
router.delete('/:id', requirePermission(Permission.DELETE_DOCUMENTS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('document_extractions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logger.info('Document deleted', { id });
    res.json({ success: true, message: 'Document deleted' });
  } catch (error: any) {
    logger.error('Error deleting document', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

export default router;
