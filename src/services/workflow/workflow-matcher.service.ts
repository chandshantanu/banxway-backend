import { openRouterService } from '../ai/openrouter.service';
import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';
import {
  WorkflowDefinition,
  WorkflowMatchRequest,
  WorkflowMatchResult,
  WorkflowInstance,
} from '../../types/workflow';

export class WorkflowMatcherService {
  constructor() {
    // OpenRouter service is initialized globally
  }

  /**
   * Match shipment to best workflow using LLM
   */
  async matchWorkflow(request: WorkflowMatchRequest): Promise<WorkflowMatchResult[]> {
    try {
      // Fetch all active workflows
      const { data: workflows, error } = await supabaseAdmin
        .from('workflow_definitions')
        .select('*')
        .eq('status', 'ACTIVE');

      if (error || !workflows || workflows.length === 0) {
        logger.warn('No active workflows found');
        return [];
      }

      const workflowDefs = workflows as unknown as WorkflowDefinition[];

      // Build context for LLM
      const context = this.buildContext(request);

      // Build workflow descriptions
      const workflowDescriptions = workflowDefs.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        category: w.category,
        serviceTypes: w.serviceTypes,
        customerTiers: w.customerTiers,
        tags: w.tags,
      }));

      // Ask LLM to match workflows
      const prompt = `You are a logistics workflow matching expert. Your task is to match the following shipment/customer context to the most appropriate workflows.

Context:
${context}

Available Workflows:
${JSON.stringify(workflowDescriptions, null, 2)}

Please analyze the context and rank the workflows from most suitable to least suitable. Consider:
1. Service type match (e.g., SEA_FCL, AIR, etc.)
2. Customer tier and requirements
3. Workflow category and purpose
4. Any specific requirements mentioned in the context

Return your response as a JSON array with this structure:
[
  {
    "workflowId": "uuid",
    "matchScore": 0-100,
    "matchReason": "explanation of why this workflow matches",
    "confidence": 0-1,
    "suggestedVariables": {
      "key": "value"
    }
  }
]

Return only the top 3 most relevant workflows.`;

      const matches = await openRouterService.chatCompletionJSON<any>(
        [
          {
            role: 'system',
            content: 'You are an expert logistics workflow matcher. Return only valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        {
          temperature: 0.3,
        }
      );

      // Ensure we return array
      const results = Array.isArray(matches) ? matches : matches.matches || [];

      logger.info('Workflow matching completed', {
        totalWorkflows: workflowDefs.length,
        matchesFound: results.length,
      });

      return results.map((r: any) => ({
        workflowId: r.workflowId,
        workflowName: workflowDefs.find(w => w.id === r.workflowId)?.name || 'Unknown',
        matchScore: r.matchScore,
        matchReason: r.matchReason,
        confidence: r.confidence,
        suggestedVariables: r.suggestedVariables,
      }));
    } catch (error: any) {
      logger.error('Failed to match workflow', { error: error.message });
      throw new Error(`Workflow matching failed: ${error.message}`);
    }
  }

  /**
   * Auto-assign workflow to shipment
   */
  async autoAssignWorkflow(params: {
    shipmentId: string;
    threshold?: number;
  }): Promise<{ workflowId: string; instanceId: string } | null> {
    try {
      const threshold = params.threshold || 70;

      // Fetch shipment details
      const { data: shipment } = await supabaseAdmin
        .from('shipments')
        .select('*, customers(*)')
        .eq('id', params.shipmentId)
        .single();

      if (!shipment) {
        throw new Error('Shipment not found');
      }

      // Build match request
      const matchRequest: WorkflowMatchRequest = {
        shipment: {
          serviceType: shipment.service_type,
          originCountry: shipment.origin_country,
          destinationCountry: shipment.destination_country,
          cargoType: shipment.cargo_type,
        },
        customer: {
          tier: shipment.customers?.tier,
        },
      };

      // Get workflow matches
      const matches = await this.matchWorkflow(matchRequest);

      // Find best match above threshold
      const bestMatch = matches.find(m => m.matchScore >= threshold);

      if (!bestMatch) {
        logger.info('No workflow matches threshold', { shipmentId: params.shipmentId, threshold });
        return null;
      }

      // Start workflow
      const workflowEngine = require('./workflow-engine').default;
      const instance = await workflowEngine.startWorkflow({
        workflowDefinitionId: bestMatch.workflowId,
        entityType: 'SHIPMENT',
        shipmentId: params.shipmentId,
        initialContext: {
          shipment,
          customer: shipment.customers,
          matchScore: bestMatch.matchScore,
          matchReason: bestMatch.matchReason,
          ...(bestMatch.suggestedVariables || {}),
        },
      });

      logger.info('Workflow auto-assigned', {
        shipmentId: params.shipmentId,
        workflowId: bestMatch.workflowId,
        instanceId: instance.id,
        matchScore: bestMatch.matchScore,
      });

      return {
        workflowId: bestMatch.workflowId,
        instanceId: instance.id,
      };
    } catch (error: any) {
      logger.error('Failed to auto-assign workflow', { error: error.message });
      throw error;
    }
  }

  /**
   * Get workflow suggestions for a communication thread
   */
  async suggestWorkflowForThread(threadId: string): Promise<WorkflowMatchResult[]> {
    try {
      // Fetch thread details
      const { data: thread } = await supabaseAdmin
        .from('communication_threads')
        .select('*, customers(*), shipments(*)')
        .eq('id', threadId)
        .single();

      if (!thread) {
        throw new Error('Thread not found');
      }

      // Fetch recent messages for context
      const { data: messages } = await supabaseAdmin
        .from('communication_messages')
        .select('content, ai_summary')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Build context from messages
      const messageContext = messages
        ?.map(m => m.ai_summary || m.content)
        .join('\n');

      const matchRequest: WorkflowMatchRequest = {
        thread: {
          type: thread.type,
          priority: thread.priority,
          channel: thread.primary_channel,
        },
        customer: {
          tier: thread.customers?.tier,
        },
        shipment: thread.shipments
          ? {
              serviceType: thread.shipments.service_type,
              originCountry: thread.shipments.origin_country,
              destinationCountry: thread.shipments.destination_country,
            }
          : undefined,
        context: messageContext,
      };

      return await this.matchWorkflow(matchRequest);
    } catch (error: any) {
      logger.error('Failed to suggest workflow for thread', { error: error.message });
      throw error;
    }
  }

  /**
   * Build context string for LLM
   */
  private buildContext(request: WorkflowMatchRequest): string {
    const parts: string[] = [];

    if (request.shipment) {
      parts.push('Shipment Details:');
      parts.push(`- Service Type: ${request.shipment.serviceType}`);
      parts.push(`- Origin: ${request.shipment.originCountry || 'N/A'}`);
      parts.push(`- Destination: ${request.shipment.destinationCountry || 'N/A'}`);
      if (request.shipment.cargoType) {
        parts.push(`- Cargo Type: ${request.shipment.cargoType}`);
      }
    }

    if (request.customer) {
      parts.push('\nCustomer Details:');
      parts.push(`- Tier: ${request.customer.tier}`);
      if (request.customer.industry) {
        parts.push(`- Industry: ${request.customer.industry}`);
      }
    }

    if (request.thread) {
      parts.push('\nThread Details:');
      parts.push(`- Type: ${request.thread.type}`);
      parts.push(`- Priority: ${request.thread.priority}`);
      parts.push(`- Channel: ${request.thread.channel}`);
    }

    if (request.context) {
      parts.push('\nAdditional Context:');
      parts.push(request.context);
    }

    return parts.join('\n');
  }

  /**
   * Analyze workflow performance and suggest improvements
   */
  async analyzeWorkflowPerformance(workflowId: string): Promise<{
    totalExecutions: number;
    successRate: number;
    avgCompletionTime: number;
    commonFailurePoints: string[];
    suggestions: string[];
  }> {
    try {
      // Fetch workflow instances
      const { data: instances } = await supabaseAdmin
        .from('workflow_instances')
        .select('*')
        .eq('workflowDefinitionId', workflowId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!instances || instances.length === 0) {
        return {
          totalExecutions: 0,
          successRate: 0,
          avgCompletionTime: 0,
          commonFailurePoints: [],
          suggestions: [],
        };
      }

      const workflowInstances = instances as unknown as WorkflowInstance[];

      // Calculate metrics
      const totalExecutions = workflowInstances.length;
      const successfulExecutions = workflowInstances.filter(
        i => i.status === 'COMPLETED'
      ).length;
      const successRate = (successfulExecutions / totalExecutions) * 100;

      const completedInstances = workflowInstances.filter(
        i => i.status === 'COMPLETED' && i.startedAt && i.completedAt
      );

      const avgCompletionTime = completedInstances.length > 0
        ? completedInstances.reduce((sum, i) => {
            const duration = new Date(i.completedAt!).getTime() - new Date(i.startedAt!).getTime();
            return sum + duration;
          }, 0) / completedInstances.length / 60000 // Convert to minutes
        : 0;

      // Analyze failure points
      const failedInstances = workflowInstances.filter(i => i.status === 'FAILED');
      const failurePoints: Record<string, number> = {};

      failedInstances.forEach(instance => {
        if (instance.errors && instance.errors.length > 0) {
          instance.errors.forEach(error => {
            const key = error.nodeId || 'unknown';
            failurePoints[key] = (failurePoints[key] || 0) + 1;
          });
        }
      });

      const commonFailurePoints = Object.entries(failurePoints)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([nodeId]) => nodeId);

      // Generate suggestions using LLM
      const suggestions = await this.generateImprovementSuggestions({
        totalExecutions,
        successRate,
        avgCompletionTime,
        commonFailurePoints,
      });

      return {
        totalExecutions,
        successRate,
        avgCompletionTime,
        commonFailurePoints,
        suggestions,
      };
    } catch (error: any) {
      logger.error('Failed to analyze workflow performance', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate improvement suggestions using LLM
   */
  private async generateImprovementSuggestions(metrics: {
    totalExecutions: number;
    successRate: number;
    avgCompletionTime: number;
    commonFailurePoints: string[];
  }): Promise<string[]> {
    try {
      const prompt = `Analyze the following workflow performance metrics and suggest improvements:

Metrics:
- Total Executions: ${metrics.totalExecutions}
- Success Rate: ${metrics.successRate.toFixed(2)}%
- Average Completion Time: ${metrics.avgCompletionTime.toFixed(2)} minutes
- Common Failure Points: ${metrics.commonFailurePoints.join(', ')}

Provide 3-5 specific, actionable suggestions to improve this workflow. Consider:
1. Ways to improve success rate
2. Optimizations to reduce completion time
3. Better error handling
4. Process improvements

Return suggestions as a JSON array of strings.`;

      const result = await openRouterService.chatCompletionJSON<{suggestions: string[]}>(
        [
          {
            role: 'system',
            content: 'You are a logistics workflow optimization expert. Provide practical suggestions.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        { temperature: 0.7 }
      );

      return result.suggestions || [];
    } catch (error: any) {
      logger.error('Failed to generate improvement suggestions', { error: error.message });
      return [];
    }
  }
}

export default new WorkflowMatcherService();
