import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { validateRequest } from '../../../utils/validation';
import { ApiResponse } from '../../../types';
import { asyncHandler } from '../../../middleware/error.middleware';
import aiSuggestionService from '../../../services/ai-suggestion.service';

const router = Router();

// Validation schema
const bulkApproveSchema = z.object({
    suggestion_ids: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * POST /api/v1/workflows/ai-suggestions/bulk-approve
 * Bulk approve multiple suggestions
 */
router.post(
    '/bulk-approve',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const validated = validateRequest(bulkApproveSchema, req.body);

        const results = await Promise.allSettled(
            validated.suggestion_ids.map(id =>
                aiSuggestionService.approveSuggestion(id, req.user!.id)
            )
        );

        const approved = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        const response: ApiResponse = {
            success: true,
            data: {
                total: validated.suggestion_ids.length,
                approved,
                failed,
                results: results.map((r, i) => ({
                    suggestion_id: validated.suggestion_ids[i],
                    status: r.status,
                    error: r.status === 'rejected' ? r.reason : null,
                })),
            },
        };

        res.json(response);
    })
);

/**
 * POST /api/v1/workflows/ai-suggestions/bulk-reject
 * Bulk reject multiple suggestions
 */
router.post(
    '/bulk-reject',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const schema = z.object({
            suggestion_ids: z.array(z.string().uuid()).min(1).max(50),
            rejection_reason: z.string().min(1),
        });

        const validated = validateRequest(schema, req.body);

        const results = await Promise.allSettled(
            validated.suggestion_ids.map(id =>
                aiSuggestionService.rejectSuggestion(id, req.user!.id, validated.rejection_reason)
            )
        );

        const rejected = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        const response: ApiResponse = {
            success: true,
            data: {
                total: validated.suggestion_ids.length,
                rejected,
                failed,
            },
        };

        res.json(response);
    })
);

export default router;
