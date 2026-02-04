import { Router, Response } from 'express';
import { AuthenticatedRequest, requirePermission } from '../../../middleware/auth.middleware';
import { ApiResponse } from '../../../types';
import { logger } from '../../../utils/logger';
import { Permission } from '../../../utils/permissions';
import { supabaseAdmin } from '../../../config/database.config';
import { asyncHandler } from '../../../middleware/error.middleware';

const router = Router();

/**
 * GET /api/v1/communications/stats
 * Get inbox/communications statistics
 */
router.get('/stats', requirePermission(Permission.VIEW_THREADS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Get thread counts by status
        const { data: threads, error: threadsError } = await supabaseAdmin
            .from('communication_threads')
            .select('status, priority, archived')
            .eq('archived', false);

        if (threadsError) {
            logger.error('Failed to fetch thread stats', { error: threadsError });
            throw threadsError;
        }

        // Calculate stats
        const stats = {
            total: threads?.length || 0,
            by_status: {
                open: threads?.filter(t => t.status === 'OPEN').length || 0,
                in_progress: threads?.filter(t => t.status === 'IN_PROGRESS').length || 0,
                pending: threads?.filter(t => t.status === 'PENDING_CUSTOMER').length || 0,
                closed: threads?.filter(t => t.status === 'CLOSED').length || 0,
            },
            by_priority: {
                urgent: threads?.filter(t => t.priority === 'URGENT').length || 0,
                high: threads?.filter(t => t.priority === 'HIGH').length || 0,
                medium: threads?.filter(t => t.priority === 'MEDIUM').length || 0,
                low: threads?.filter(t => t.priority === 'LOW').length || 0,
            },
        };

        const response: ApiResponse = {
            success: true,
            data: stats,
        };

        res.json(response);
    } catch (error: any) {
        logger.error('Failed to get inbox stats', { error: error.message });
        const response: ApiResponse = {
            success: false,
            error: {
                code: 'STATS_ERROR',
                message: 'Failed to retrieve inbox statistics',
            },
        };
        res.status(500).json(response);
    }
}));

export default router;
