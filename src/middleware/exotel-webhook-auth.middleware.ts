import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Verify Exotel webhook signature
 *
 * Exotel signs webhooks with HMAC-SHA1 using the auth token
 * Signature is sent in X-Exotel-Signature header
 */
export function verifyExotelWebhook(req: Request, res: Response, next: NextFunction) {
  // Skip verification in development
  if (process.env.NODE_ENV === 'development' || process.env.ENABLE_WEBHOOK_SIGNATURE_VERIFICATION !== 'true') {
    return next();
  }

  const signature = req.headers['x-exotel-signature'] as string;
  const authToken = process.env.EXOTEL_TOKEN;

  if (!signature) {
    logger.warn('Webhook received without signature', {
      path: req.path,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Missing signature' });
  }

  if (!authToken) {
    logger.error('EXOTEL_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Construct URL
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Sort parameters and concatenate
    const params = Object.keys(req.body)
      .sort()
      .map(key => `${key}${req.body[key]}`)
      .join('');

    // Compute expected signature
    const data = url + params;
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data)
      .digest('base64');

    // Verify signature
    if (signature !== expectedSignature) {
      logger.warn('Webhook signature verification failed', {
        path: req.path,
        ip: req.ip,
        received: signature,
        expected: expectedSignature,
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Signature valid
    logger.info('Webhook signature verified', {
      path: req.path,
    });
    next();
  } catch (error: any) {
    logger.error('Error verifying webhook signature', {
      error: error.message,
      path: req.path,
    });
    return res.status(500).json({ error: 'Signature verification error' });
  }
}

/**
 * Log all webhook requests for debugging
 */
export function logWebhookRequest(req: Request, res: Response, next: NextFunction) {
  logger.info('Webhook request received', {
    path: req.path,
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-exotel-signature': req.headers['x-exotel-signature'] ? '[PRESENT]' : '[MISSING]',
    },
    body: req.body,
    ip: req.ip,
  });
  next();
}
