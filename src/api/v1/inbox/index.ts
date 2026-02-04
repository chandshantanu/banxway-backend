import { Router, Request, Response, NextFunction } from 'express';
import communicationsRouter from '../communications';

const router = Router();

/**
 * Inbox router - Aliases /inbox/* to /communications/*
 * This provides backward compatibility for frontend calling /inbox endpoints
 */

// Forward all /inbox requests to /communications
router.use('/', (req: Request, res: Response, next: NextFunction) => {
    // Rewrite the base URL path from /inbox to /communications
    const originalUrl = req.originalUrl;
    req.url = originalUrl.replace('/api/v1/inbox', '/api/v1/communications');

    // Pass to communications router
    communicationsRouter(req, res, next);
});

export default router;
