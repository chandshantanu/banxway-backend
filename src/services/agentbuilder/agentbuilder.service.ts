/**
 * AgentBuilder Service
 * HTTP client for AgentBuilder API at agentsapi.chatslytics.com
 * Manages all 17 Banxway agents across 5 layers
 *
 * @created 2026-02-05
 * @updated 2026-02-15
 */

import { logger } from '../../utils/logger';
import { AGENTBUILDER_CONFIG, AGENT_LAYERS, isMcpEnabled, getAuthHeader } from './mcp-config';
import {
  AgentBuilderParseResult,
  AgentBuilderValidationResult,
} from '../../types';

interface AgentListResponse {
  agents: any[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export class AgentBuilderService {
  private apiUrl: string;
  private isEnabled: boolean;

  constructor() {
    this.apiUrl = AGENTBUILDER_CONFIG.apiUrl;
    this.isEnabled = isMcpEnabled();

    if (this.isEnabled) {
      logger.info('AgentBuilder service initialized', { apiUrl: this.apiUrl });
    } else {
      logger.warn('AgentBuilder not configured - using fallback parsing');
    }
  }

  private async apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let parsed: any = {};
      try { parsed = JSON.parse(errorBody); } catch {}
      const message = parsed.error?.message || parsed.detail || errorBody;
      throw new Error(`AgentBuilder API error (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * List all Banxway agents from AgentBuilder
   */
  async listAgents(filters?: { category?: string; search?: string; status?: string }): Promise<any[]> {
    if (!this.isEnabled) {
      logger.debug('AgentBuilder not enabled - returning empty list');
      return [];
    }

    try {
      // Fetch each agent individually by ID — the list endpoint returns empty
      // but individual get_agent works reliably
      const knownAgents = AGENTBUILDER_CONFIG.agents;
      const agentEntries = Object.entries(knownAgents);

      const results = await Promise.allSettled(
        agentEntries.map(async ([key, id]) => {
          try {
            const agent = await this.apiRequest<any>(`/api/v1/agents/${id}`);
            return this.mapAgentToInternal(agent);
          } catch (err) {
            logger.debug(`Failed to fetch agent ${key} (${id})`, { error: (err as Error).message });
            return null;
          }
        })
      );

      const agents = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      // Apply filters if provided
      let filtered = agents;
      if (filters?.status) {
        filtered = filtered.filter((a: any) => a.status === filters.status);
      }
      if (filters?.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter((a: any) =>
          a.name?.toLowerCase().includes(search) || a.description?.toLowerCase().includes(search)
        );
      }

      logger.info(`Listed ${filtered.length}/${agentEntries.length} agents from AgentBuilder`);
      return filtered;
    } catch (error) {
      logger.error('Failed to list agents', { error: (error as Error).message });
      return [];
    }
  }

  /**
   * Get a single agent by ID
   */
  async getAgent(agentId: string): Promise<any | null> {
    if (!this.isEnabled) return null;

    try {
      const result = await this.apiRequest<any>(`/api/v1/agents/${agentId}`);
      return this.mapAgentToInternal(result);
    } catch (error) {
      logger.error('Failed to get agent', { agentId, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Execute an agent with input data
   */
  async executeAgent(agentId: string, input: Record<string, any>): Promise<any> {
    if (!this.isEnabled) {
      throw new Error('AgentBuilder not configured');
    }

    logger.info('Executing agent', { agentId, inputKeys: Object.keys(input) });

    const result = await this.apiRequest<any>(`/api/v1/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });

    logger.info('Agent execution complete', { agentId, executionId: result.execution_id });
    return result;
  }

  /**
   * Get execution history for an agent
   */
  async getExecutions(agentId: string): Promise<any[]> {
    if (!this.isEnabled) return [];

    try {
      const result = await this.apiRequest<any>(`/api/v1/agents/${agentId}/executions`);
      return result.executions || [];
    } catch (error) {
      logger.error('Failed to get executions', { agentId, error: (error as Error).message });
      return [];
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<any | null> {
    if (!this.isEnabled) return null;

    try {
      return await this.apiRequest<any>(`/api/v1/executions/${executionId}`);
    } catch (error) {
      logger.error('Failed to get execution status', { executionId, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Deploy an agent
   */
  async deployAgent(agentId: string): Promise<any> {
    if (!this.isEnabled) {
      throw new Error('AgentBuilder not configured');
    }

    logger.info('Deploying agent', { agentId });
    return this.apiRequest<any>(`/api/v1/agents/${agentId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
  }

  /**
   * Health check all agents
   */
  async getAgentHealth(): Promise<any[]> {
    const agents = await this.listAgents();
    return agents.map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      layer: agent.layer,
      lastUsed: agent.metrics?.last_used || null,
      totalExecutions: agent.metrics?.total_invocations || 0,
      successRate: agent.metrics?.total_invocations > 0
        ? ((agent.metrics?.successful_executions || 0) / agent.metrics.total_invocations * 100).toFixed(1)
        : '0.0',
    }));
  }

  /**
   * Execute communication parsing agent
   */
  async parseCommunication(params: {
    channel: 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'SMS' | 'MANUAL';
    content: string;
    subject?: string;
    sender: { email?: string; phone?: string; name?: string };
    metadata?: Record<string, any>;
  }): Promise<AgentBuilderParseResult> {
    if (!this.isEnabled) {
      return this.fallbackParseCommunication(params);
    }

    try {
      const result = await this.executeAgent(AGENTBUILDER_CONFIG.agents.communicationParser, {
        channel: params.channel,
        content: params.content,
        subject: params.subject,
        sender: params.sender,
        metadata: params.metadata,
      });

      return result.output || this.fallbackParseCommunication(params);
    } catch (error) {
      logger.error('Agent parse failed, using fallback', { error: (error as Error).message });
      return this.fallbackParseCommunication(params);
    }
  }

  /**
   * Execute validation agent
   */
  async validateExtractedData(params: {
    intent: string;
    entities: Record<string, any>;
    customerInfo: Record<string, any>;
  }): Promise<AgentBuilderValidationResult> {
    if (!this.isEnabled) {
      return this.fallbackValidateData(params);
    }

    try {
      const result = await this.executeAgent(AGENTBUILDER_CONFIG.agents.dataValidator, params);
      return result.output || this.fallbackValidateData(params);
    } catch (error) {
      logger.error('Agent validation failed, using fallback', { error: (error as Error).message });
      return this.fallbackValidateData(params);
    }
  }

  /** Map AgentBuilder agent to internal format matching frontend Agent type */
  private mapAgentToInternal(agent: any): any {
    const agentIdToKey = Object.entries(AGENTBUILDER_CONFIG.agents)
      .reduce((acc, [key, id]) => ({ ...acc, [id]: key }), {} as Record<string, string>);

    const agentKey = agentIdToKey[agent.id] || '';
    let layer = 'UNKNOWN';
    for (const [layerKey, layerConfig] of Object.entries(AGENT_LAYERS)) {
      if (layerConfig.agents.includes(agentKey)) {
        layer = layerKey;
        break;
      }
    }

    const totalInvocations = agent.metrics?.total_invocations || 0;
    const successfulExecutions = agent.metrics?.successful_executions || 0;
    const failedExecutions = agent.metrics?.failed_executions || 0;
    const avgExecTime = agent.metrics?.average_execution_time || 0;
    const accuracy = totalInvocations > 0
      ? (successfulExecutions / totalInvocations) * 100
      : 0;
    const errorRate = totalInvocations > 0
      ? (failedExecutions / totalInvocations) * 100
      : 0;

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
      layer,
      status: agent.status === 'active' ? 'HEALTHY' : agent.status === 'draft' ? 'IDLE' : 'OFFLINE',
      isEnabled: agent.status === 'active',
      processedToday: totalInvocations,
      avgLatencyMs: avgExecTime,
      accuracy: parseFloat(accuracy.toFixed(1)),
      errorRate: parseFloat(errorRate.toFixed(2)),
      currentActivity: agent.status === 'active' ? 'Running' : 'Idle',
      queueSize: 0,
      lastHeartbeat: agent.updated_at || new Date().toISOString(),
      metrics: {
        totalInvocations,
        successfulExecutions,
        failedExecutions,
        averageExecutionTime: avgExecTime,
        lastUsed: agent.metrics?.last_used || null,
      },
    };
  }

  // Fallback parsers (when API not available)

  private fallbackParseCommunication(params: {
    channel: string;
    content: string;
    subject?: string;
    sender: any;
  }): AgentBuilderParseResult {
    const content = params.content.toLowerCase();
    const subject = (params.subject || '').toLowerCase();
    const combinedText = `${subject} ${content}`;

    let intent: AgentBuilderParseResult['intent'] = 'general';
    let confidence = 0.5;

    if (combinedText.includes('quote') || combinedText.includes('quotation') || combinedText.includes('rate')) {
      intent = 'quote_request'; confidence = 0.7;
    } else if (combinedText.includes('booking') || combinedText.includes('confirm')) {
      intent = 'booking'; confidence = 0.7;
    } else if (combinedText.includes('document') || combinedText.includes('bl') || combinedText.includes('invoice')) {
      intent = 'document_upload'; confidence = 0.6;
    } else if (combinedText.includes('status') || combinedText.includes('update') || combinedText.includes('where')) {
      intent = 'status_inquiry'; confidence = 0.6;
    } else if (combinedText.includes('complaint') || combinedText.includes('issue') || combinedText.includes('problem')) {
      intent = 'complaint'; confidence = 0.7;
    }

    const entities: AgentBuilderParseResult['entities'] = {};
    const weightMatch = content.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|ton|tons|mt)/i);
    if (weightMatch) entities.weight = parseFloat(weightMatch[1]);

    const customerInfo: AgentBuilderParseResult['customerInfo'] = {
      email: params.sender.email,
      phone: params.sender.phone,
      name: params.sender.name,
    };

    return {
      intent,
      confidence,
      entities,
      customerInfo,
      requiresHumanReview: confidence < 0.6,
      extractedText: params.content,
      summary: `${intent} detected via ${params.channel}`,
    };
  }

  private fallbackValidateData(params: {
    intent: string;
    entities: Record<string, any>;
    customerInfo: Record<string, any>;
  }): AgentBuilderValidationResult {
    const missingFields: string[] = [];
    const validationErrors: Record<string, string> = {};
    const suggestions: string[] = [];

    if (params.intent === 'quote_request') {
      if (!params.entities.pol) missingFields.push('POL (Port of Loading)');
      if (!params.entities.pod) missingFields.push('POD (Port of Discharge)');
      if (!params.entities.commodity) missingFields.push('Commodity');
    }

    if (!params.customerInfo.email && !params.customerInfo.phone) {
      missingFields.push('Customer contact (email or phone)');
      suggestions.push('Request customer email or phone number');
    }

    const isValid = missingFields.length === 0 && Object.keys(validationErrors).length === 0;

    return {
      isValid,
      confidence: isValid ? 0.8 : 0.5,
      missingFields,
      validationErrors,
      suggestions,
    };
  }
}

export default new AgentBuilderService();
