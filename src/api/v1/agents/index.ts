import { Router, Request, Response } from 'express';
import { authenticateRequest } from '../../../middleware/auth.middleware';
import agentBuilderService from '../../../services/agentbuilder/agentbuilder.service';
import { logger } from '../../../utils/logger';

const router = Router();

// All agent routes require authentication
router.use(authenticateRequest);

/**
 * GET /api/v1/agents
 * List all Banxway agents with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search, status } = req.query;
    const agents = await agentBuilderService.listAgents({
      category: category as string,
      search: search as string,
      status: status as string,
    });

    res.json({
      success: true,
      data: agents,
      count: agents.length,
    });
  } catch (error) {
    logger.error('Failed to list agents', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to retrieve agents' });
  }
});

/**
 * GET /api/v1/agents/health
 * Health check for all agents
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await agentBuilderService.getAgentHealth();
    res.json({ success: true, data: health });
  } catch (error) {
    logger.error('Failed to get agent health', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to check agent health' });
  }
});

/**
 * GET /api/v1/agents/:id
 * Get a single agent by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const agent = await agentBuilderService.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, data: agent });
  } catch (error) {
    logger.error('Failed to get agent', { id: req.params.id, error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to retrieve agent' });
  }
});

/**
 * POST /api/v1/agents/:id/execute
 * Execute an agent with input data
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const result = await agentBuilderService.executeAgent(req.params.id, req.body.input || req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to execute agent', { id: req.params.id, error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to execute agent' });
  }
});

/**
 * GET /api/v1/agents/:id/executions
 * Get execution history for an agent
 */
router.get('/:id/executions', async (req: Request, res: Response) => {
  try {
    const executions = await agentBuilderService.getExecutions(req.params.id);
    res.json({ success: true, data: executions, count: executions.length });
  } catch (error) {
    logger.error('Failed to get executions', { id: req.params.id, error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to retrieve executions' });
  }
});

/**
 * POST /api/v1/agents/:id/deploy
 * Deploy an agent
 */
router.post('/:id/deploy', async (req: Request, res: Response) => {
  try {
    const result = await agentBuilderService.deployAgent(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to deploy agent', { id: req.params.id, error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to deploy agent' });
  }
});

export default router;
