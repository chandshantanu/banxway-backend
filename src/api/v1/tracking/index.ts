import { Router, Request, Response } from 'express';
import trackingService from '../../../services/email/tracking.service';
import { logger } from '../../../utils/logger';

const router = Router();

// These endpoints are PUBLIC (no auth) — they're hit by email clients loading pixels/clicking links

/**
 * GET /api/v1/tracking/open/:trackingId
 * Returns 1x1 transparent pixel and records OPEN event
 */
router.get('/open/:trackingId', async (req: Request, res: Response): Promise<void> => {
  const { trackingId } = req.params;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
  const userAgent = req.headers['user-agent'] || null;

  // Record event asynchronously (don't block pixel delivery)
  trackingService.recordEvent(trackingId, 'OPEN', ip, userAgent).catch((err: Error) => {
    logger.error('Failed to record open event', { trackingId, error: err.message });
  });

  // Return tracking pixel immediately
  const pixel = trackingService.getTrackingPixel();
  res.set({
    'Content-Type': 'image/png',
    'Content-Length': String(pixel.length),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.status(200).send(pixel);
});

/**
 * GET /api/v1/tracking/click/:trackingId/:linkIndex
 * Records CLICK event and redirects to original URL
 */
router.get('/click/:trackingId/:linkIndex', async (req: Request, res: Response): Promise<void> => {
  const { trackingId } = req.params;
  const originalUrl = req.query.url as string;

  if (!originalUrl) {
    res.status(400).send('Missing URL parameter');
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
  const userAgent = req.headers['user-agent'] || null;

  // Record click event asynchronously
  trackingService.recordEvent(trackingId, 'CLICK', ip, userAgent, originalUrl).catch((err: Error) => {
    logger.error('Failed to record click event', { trackingId, error: err.message });
  });

  // Redirect to original URL
  res.redirect(302, originalUrl);
});

/**
 * GET /api/v1/tracking/unsubscribe/:trackingId
 * Shows unsubscribe confirmation page and records UNSUBSCRIBE event
 */
router.get('/unsubscribe/:trackingId', async (req: Request, res: Response): Promise<void> => {
  const { trackingId } = req.params;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
  const userAgent = req.headers['user-agent'] || null;

  // Record unsubscribe event
  await trackingService.recordEvent(trackingId, 'UNSUBSCRIBE', ip, userAgent);

  // Return simple confirmation page
  res.set('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Unsubscribed - Banxway</title>
    <style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}
    .card{background:#fff;border-radius:12px;padding:40px;max-width:400px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
    h1{color:#0A2D5B;font-size:24px}p{color:#6b7280;line-height:1.6}</style></head>
    <body><div class="card">
    <h1>Unsubscribed</h1>
    <p>You have been unsubscribed from tracking emails from Banxway Global.</p>
    <p style="font-size:13px;margin-top:20px">If this was a mistake, no action is needed — you will still receive regular emails.</p>
    </div></body></html>
  `);
});

export default router;
