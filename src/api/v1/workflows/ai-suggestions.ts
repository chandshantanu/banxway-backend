import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { validateRequest } from '../../../utils/validation';
import { ApiResponse } from '../../../types';
import { asyncHandler } from '../../../middleware/error.middleware';
import aiSuggestionService from '../../../services/ai-suggestion.service';

const router = Router();

// Validation schemas
const submitSuggestionSchema = z.object({
    workflow_instance_id: z.string().uuid(),
    node_id: z.string().optional(),
    suggestion_type: z.enum(['EMAIL_DRAFT', 'NEXT_STEP', 'DATA_EXTRACTION', 'QUOTATION_DRAFT', 'DOCUMENT_CLASSIFICATION']),
    suggestion_data: z.record(z.any()),
    confidence_score: z.number().min(0).max(1),
    guard_rail_checks: z.record(z.any()).optional(),
});

const approveSuggestionSchema = z.object({
    edited_data: z.record(z.any()).optional(),
});

const rejectSuggestionSchema = z.object({
    rejection_reason: z.string().min(1),
});

// ============================================================================
// AI SUGGESTION ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/workflows/ai-suggestions
 * Submit AI suggestion from agent
 */
router.post(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const validated = validateRequest(submitSuggestionSchema, req.body);

        const result = await aiSuggestionService.submitSuggestion({
            workflow_instance_id: validated.workflow_instance_id,
            node_id: validated.node_id,
            suggestion_type: validated.suggestion_type,
            suggestion_data: validated.suggestion_data,
            confidence_score: validated.confidence_score,
            guard_rail_checks: validated.guard_rail_checks,
        });

        const response: ApiResponse = {
            success: true,
            data: result,
        };

        res.status(201).json(response);
    })
);

/**
 * GET /api/v1/workflows/ai-suggestions/pending
 * Get pending AI suggestions for review
 */
router.get(
    '/pending',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const filters = {
            suggestion_type: req.query.type as string,
            min_confidence: req.query.min_confidence ? parseFloat(req.query.min_confidence as string) : undefined,
            max_confidence: req.query.max_confidence ? parseFloat(req.query.max_confidence as string) : undefined,
        };

        const suggestions = await aiSuggestionService.getPendingSuggestions(filters);

        const response: ApiResponse = {
            success: true,
            data: suggestions,
        };

        res.json(response);
    })
);

/**
 * GET /api/v1/workflows/ai-suggestions/stats
 * Get dashboard statistics
 */
router.get(
    '/stats',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const stats = await aiSuggestionService.getDashboardStats();

        const response: ApiResponse = {
            success: true,
            data: stats,
        };

        res.json(response);
    })
);

/**
 * GET /api/v1/workflows/ai-suggestions/:id
 * Get specific AI suggestion
 */
router.get(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;

        const suggestion = await aiSuggestionService.getSuggestionById(id);

        const response: ApiResponse = {
            success: true,
            data: suggestion,
        };

        res.json(response);
    })
);

/**
 * POST /api/v1/workflows/ai-suggestions/:id/approve
 * Approve AI suggestion (optionally with edits)
 */
router.post(
    '/:id/approve',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const validated = validateRequest(approveSuggestionSchema, req.body);

        const result = await aiSuggestionService.approveSuggestion(
            id,
            req.user!.id,
            validated.edited_data
        );

        const response: ApiResponse = {
            success: true,
            data: result.data,
            message: validated.edited_data
                ? 'Suggestion approved with edits'
                : 'Suggestion approved',
        };

        res.json(response);
    })
);

/**
 * POST /api/v1/workflows/ai-suggestions/:id/reject
 * Reject AI suggestion
 */
router.post(
    '/:id/reject',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const validated = validateRequest(rejectSuggestionSchema, req.body);

        await aiSuggestionService.rejectSuggestion(
            id,
            req.user!.id,
            validated.rejection_reason
        );

        const response: ApiResponse = {
            success: true,
            message: 'Suggestion rejected',
        };

        res.json(response);
    })
);

export default router;
