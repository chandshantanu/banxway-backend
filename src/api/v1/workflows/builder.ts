import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { supabaseAdmin } from '../../../config/database.config';
import { validateRequest, paginationSchema } from '../../../utils/validation';
import { ApiResponse, WorkflowCategory, WorkflowNodeType } from '../../../types';
import { WorkflowDefinition } from '../../../types/workflow';
import workflowEngine from '../../../services/workflow/workflow-engine';
import workflowMatcher from '../../../services/workflow/workflow-matcher.service';
import { logger } from '../../../utils/logger';

const router = Router();

// Validation schemas
const createWorkflowSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().optional(),
  category: z.nativeEnum(WorkflowCategory),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  triggers: z.array(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  serviceTypes: z.array(z.string()).optional(),
  customerTiers: z.array(z.string()).optional(),
  slaConfig: z.any().optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

const startWorkflowSchema = z.object({
  workflowDefinitionId: z.string().uuid(),
  entityType: z.enum(['SHIPMENT', 'THREAD', 'CUSTOMER', 'STANDALONE']),
  entityId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  initialContext: z.record(z.any()).optional(),
});

const matchWorkflowSchema = z.object({
  shipment: z.object({
    serviceType: z.string(),
    originCountry: z.string().optional(),
    destinationCountry: z.string().optional(),
    cargoType: z.string().optional(),
    value: z.number().optional(),
  }).optional(),
  customer: z.object({
    tier: z.string(),
    industry: z.string().optional(),
  }).optional(),
  thread: z.object({
    type: z.string(),
    priority: z.string(),
    channel: z.string(),
  }).optional(),
  context: z.string().optional(),
});

// ============================================
// WORKFLOW DEFINITIONS (BUILDER)
// ============================================

// GET /api/v1/workflows/builder - List workflow definitions
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pagination = validateRequest(paginationSchema, req.query);
    const { status, category, search } = req.query;

    let query = supabaseAdmin
      .from('workflow_definitions')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search && typeof search === 'string') {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const from = (pagination.page - 1) * pagination.limit;
    const to = from + pagination.limit - 1;

    query = query
      .order(pagination.sortBy || 'created_at', { ascending: pagination.sortOrder === 'asc' })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pagination.limit),
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to fetch workflows', { error: error.message });
    throw error;
  }
});

// POST /api/v1/workflows/builder - Create workflow definition
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = validateRequest(createWorkflowSchema, req.body);
    const userId = req.user!.id;

    const workflow = {
      ...data,
      status: 'DRAFT',
      version: 1,
      usage_count: 0,
      created_by: userId,
    };

    const { data: created, error } = await supabaseAdmin
      .from('workflow_definitions')
      .insert(workflow)
      .select()
      .single();

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data: created,
    };

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Failed to create workflow', { error: error.message });
    throw error;
  }
});

// GET /api/v1/workflows/builder/:id - Get workflow definition
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflow_definitions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Workflow not found',
        },
      });
    }

    const response: ApiResponse = {
      success: true,
      data,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to fetch workflow', { error: error.message });
    throw error;
  }
});

// PATCH /api/v1/workflows/builder/:id - Update workflow definition
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = validateRequest(updateWorkflowSchema, req.body);

    const { data, error } = await supabaseAdmin
      .from('workflow_definitions')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to update workflow', { error: error.message });
    throw error;
  }
});

// DELETE /api/v1/workflows/builder/:id - Delete workflow definition
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await supabaseAdmin
      .from('workflow_definitions')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data: { message: 'Workflow deleted successfully' },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to delete workflow', { error: error.message });
    throw error;
  }
});

// POST /api/v1/workflows/builder/:id/publish - Publish workflow
router.post('/:id/publish', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('workflow_definitions')
      .update({
        status: 'ACTIVE',
        published_at: new Date().toISOString(),
        published_by: userId,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to publish workflow', { error: error.message });
    throw error;
  }
});

// POST /api/v1/workflows/builder/:id/duplicate - Duplicate workflow
router.post('/:id/duplicate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Fetch original workflow
    const { data: original } = await supabaseAdmin
      .from('workflow_definitions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!original) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      });
    }

    // Create duplicate
    const duplicate = {
      ...original,
      id: undefined,
      name: `${original.name} (Copy)`,
      status: 'DRAFT',
      version: 1,
      usage_count: 0,
      created_by: userId,
      created_at: undefined,
      updated_at: undefined,
      published_at: null,
      published_by: null,
    };

    const { data, error } = await supabaseAdmin
      .from('workflow_definitions')
      .insert(duplicate)
      .select()
      .single();

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data,
    };

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Failed to duplicate workflow', { error: error.message });
    throw error;
  }
});

// ============================================
// WORKFLOW EXECUTION
// ============================================

// POST /api/v1/workflows/builder/execute - Start workflow execution
router.post('/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = validateRequest(startWorkflowSchema, req.body);

    const instance = await workflowEngine.startWorkflow(data);

    const response: ApiResponse = {
      success: true,
      data: instance,
    };

    res.status(201).json(response);
  } catch (error: any) {
    logger.error('Failed to execute workflow', { error: error.message });
    throw error;
  }
});

// GET /api/v1/workflows/builder/instances - List workflow instances
router.get('/instances', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pagination = validateRequest(paginationSchema, req.query);
    const { workflowDefinitionId, status, entityType } = req.query;

    let query = supabaseAdmin
      .from('workflow_instances')
      .select('*', { count: 'exact' });

    if (workflowDefinitionId) {
      query = query.eq('workflowDefinitionId', workflowDefinitionId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (entityType) {
      query = query.eq('entityType', entityType);
    }

    const from = (pagination.page - 1) * pagination.limit;
    const to = from + pagination.limit - 1;

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    const response: ApiResponse = {
      success: true,
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pagination.limit),
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to fetch workflow instances', { error: error.message });
    throw error;
  }
});

// GET /api/v1/workflows/builder/instances/:id - Get workflow instance
router.get('/instances/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflow_instances')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow instance not found' },
      });
    }

    const response: ApiResponse = {
      success: true,
      data,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to fetch workflow instance', { error: error.message });
    throw error;
  }
});

// ============================================
// WORKFLOW MATCHING (LLM)
// ============================================

// POST /api/v1/workflows/builder/match - Match workflow using LLM
router.post('/match', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = validateRequest(matchWorkflowSchema, req.body);

    const matches = await workflowMatcher.matchWorkflow(data);

    const response: ApiResponse = {
      success: true,
      data: matches,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to match workflow', { error: error.message });
    throw error;
  }
});

// POST /api/v1/workflows/builder/auto-assign/:shipmentId - Auto-assign workflow to shipment
router.post('/auto-assign/:shipmentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { threshold } = req.body;

    const result = await workflowMatcher.autoAssignWorkflow({
      shipmentId: req.params.shipmentId,
      threshold,
    });

    if (!result) {
      return res.json({
        success: true,
        data: null,
        message: 'No suitable workflow found above threshold',
      });
    }

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to auto-assign workflow', { error: error.message });
    throw error;
  }
});

// GET /api/v1/workflows/builder/suggest-for-thread/:threadId - Suggest workflows for thread
router.get('/suggest-for-thread/:threadId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const suggestions = await workflowMatcher.suggestWorkflowForThread(req.params.threadId);

    const response: ApiResponse = {
      success: true,
      data: suggestions,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to suggest workflows for thread', { error: error.message });
    throw error;
  }
});

// ============================================
// WORKFLOW ANALYTICS
// ============================================

// GET /api/v1/workflows/builder/:id/performance - Get workflow performance analytics
router.get('/:id/performance', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const analytics = await workflowMatcher.analyzeWorkflowPerformance(req.params.id);

    const response: ApiResponse = {
      success: true,
      data: analytics,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to fetch workflow performance', { error: error.message });
    throw error;
  }
});

export default router;
