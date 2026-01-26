import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../../middleware/auth.middleware';
import { supabaseAdmin } from '../../../config/database.config';
import { logger } from '../../../utils/logger';

const router = Router();

// Configure multer for file upload (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max file size
  },
});

/**
 * POST /api/v1/attachments/upload
 * Upload a file to Supabase Storage
 */
router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }

    const file = req.file;
    const filename = `${Date.now()}-${file.originalname}`;
    const bucket = 'attachments';

    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage.from(bucket).upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

    if (error) {
      logger.error('Failed to upload file', { error: error.message });
      throw error;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);

    logger.info('File uploaded successfully', {
      filename: file.originalname,
      size: file.size,
      path: data.path,
    });

    res.json({
      success: true,
      data: {
        url: publicUrl,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      },
    });
  } catch (error: any) {
    logger.error('File upload failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Upload failed',
    });
  }
});

export default router;
