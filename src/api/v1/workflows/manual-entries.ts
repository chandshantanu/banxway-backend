import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { supabaseAdmin } from '../../../config/database.config';
import { validateRequest } from '../../../utils/validation';
import { ApiResponse } from '../../../types';
import { logger } from '../../../utils/logger';
import manualDataEntryHandler from '../../../services/workflow/handlers/manual-data-entry.handler';

const router = Router();

// Validation schemas
const submitManualEntrySchema = z.object({
    data: z.record(z.any()),
});

// ============================================================================
// MANUAL DATA ENTRY ENDPOINTS
// ============================================================================

// GET /api/v1/workflows/instances/:id/pending-entries
// Get pending manual data entry forms for a workflow instance
router.get('/instances/:id/pending-entries', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id: workflowInstanceId } = req.params;

        const { data, error } = await supabaseAdmin
            .from('workflow_manual_entries')
            .select('*')
            .eq('workflow_instance_id', workflowInstanceId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true });

        if (error) throw error;

        const response: ApiResponse = {
            success: true,
            data,
        };

        res.json(response);
    } catch (error: any) {
        logger.error('Error fetching pending manual entries', {
            error: error.message,
            workflowInstanceId: req.params.id,
        });

        const response: ApiResponse = {
            success: false,
            error: {
                code: 'FETCH_ERROR',
                message: error.message,
            },
        };

        res.status(500).json(response);
    }
});

// POST /api/v1/workflows/instances/:workflowId/manual-entry/:entryId
// Submit manual data entry
router.post(
    '/instances/:workflowId/manual-entry/:entryId',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { workflowId, entryId } = req.params;
            const validated = validateRequest(submitManualEntrySchema, req.body);

            logger.info('Submitting manual data entry', {
                entryId,
                workflowId,
                userId: req.user?.id,
            });

            // Submit the entry
            const result = await manualDataEntryHandler.submitEntry(
                entryId,
                validated.data,
                req.user!.id
            );

            if (!result.success) {
                const response: ApiResponse = {
                    success: false,
                    error: {
                        code: 'SUBMISSION_ERROR',
                        message: result.error || 'Failed to submit entry',
                    },
                };
                return res.status(400).json(response);
            }

            // Resume workflow execution
            // TODO: Trigger workflow engine to continue from this node
            logger.info('Manual entry submitted, workflow should continue', {
                entryId,
                workflowId,
            });

            const response: ApiResponse = {
                success: true,
                data: {
                    message: 'Entry submitted successfully',
                    entryId,
                },
            };

            res.json(response);
        } catch (error: any) {
            logger.error('Error submitting manual entry', {
                error: error.message,
                entryId: req.params.entryId,
            });

            const response: ApiResponse = {
                success: false,
                error: {
                    code: 'SUBMISSION_ERROR',
                    message: error.message,
                },
            };

            res.status(500).json(response);
        }
    }
);

// GET /api/v1/workflows/manual-entries/my-pending
// Get all pending manual entries assigned to current user
router.get('/manual-entries/my-pending', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const userRole = req.user!.role;

        // Get workflow instances assigned to this user or their role
        const { data, error } = await supabaseAdmin
            .from('workflow_manual_entries')
            .select(`
        *,
        workflow_instances!inner(
          id,
          workflow_definition:workflow_definitions(name, category),
          shipment:shipments(shipment_number),
          customer:customers(name, email),
          assigned_to,
          assigned_role
        )
      `)
            .eq('status', 'PENDING')
            .or(`assigned_to.eq.${userId},assigned_role.eq.${userRole}`, {
                foreignTable: 'workflow_instances',
            })
            .order('created_at', { ascending: true });

        if (error) throw error;

        const response: ApiResponse = {
            success: true,
            data,
        };

        res.json(response);
    } catch (error: any) {
        logger.error('Error fetching user pending entries', {
            error: error.message,
            userId: req.user?.id,
        });

        const response: ApiResponse = {
            success: false,
            error: {
                code: 'FETCH_ERROR',
                message: error.message,
            },
        };

        res.status(500).json(response);
    }
});

export default router;
