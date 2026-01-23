import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';
import {
  WorkflowInstance,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeType,
  NodeConfig,
} from '../../types/workflow';
import exotelTelephony from '../exotel/telephony.service';
import exotelWhatsApp from '../exotel/whatsapp.service';
import { io } from '../../index';

export class WorkflowEngine {
  /**
   * Start a workflow instance
   */
  async startWorkflow(params: {
    workflowDefinitionId: string;
    entityType: 'SHIPMENT' | 'THREAD' | 'CUSTOMER' | 'STANDALONE';
    entityId?: string;
    shipmentId?: string;
    threadId?: string;
    customerId?: string;
    initialContext?: Record<string, any>;
  }): Promise<WorkflowInstance> {
    try {
      // Fetch workflow definition
      const { data: workflow, error } = await supabaseAdmin
        .from('workflow_definitions')
        .select('*')
        .eq('id', params.workflowDefinitionId)
        .eq('status', 'ACTIVE')
        .single();

      if (error || !workflow) {
        throw new Error('Workflow definition not found or inactive');
      }

      const workflowDef = workflow as unknown as WorkflowDefinition;

      // Find START node
      const startNode = workflowDef.nodes.find(n => n.type === WorkflowNodeType.START);
      if (!startNode) {
        throw new Error('Workflow must have a START node');
      }

      // Create workflow instance
      const instance: Partial<WorkflowInstance> = {
        workflowDefinitionId: params.workflowDefinitionId,
        workflowVersion: workflowDef.version,
        entityType: params.entityType,
        entityId: params.entityId,
        shipmentId: params.shipmentId,
        threadId: params.threadId,
        customerId: params.customerId,
        status: 'IN_PROGRESS',
        currentNodeId: startNode.id,
        currentStepNumber: 0,
        totalSteps: workflowDef.nodes.length,
        context: params.initialContext || {},
        variables: {},
        errors: [],
        executionLog: [],
        startedAt: new Date(),
      };

      const { data: created, error: createError } = await supabaseAdmin
        .from('workflow_instances')
        .insert(instance)
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create workflow instance: ${createError.message}`);
      }

      logger.info('Workflow started', {
        instanceId: created.id,
        workflowId: params.workflowDefinitionId,
      });

      // Start execution
      await this.executeNextNode(created.id);

      return created as WorkflowInstance;
    } catch (error: any) {
      logger.error('Failed to start workflow', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute the next node in the workflow
   */
  async executeNextNode(instanceId: string): Promise<void> {
    try {
      // Fetch workflow instance
      const { data: instance, error } = await supabaseAdmin
        .from('workflow_instances')
        .select('*')
        .eq('id', instanceId)
        .single();

      if (error || !instance) {
        throw new Error('Workflow instance not found');
      }

      const workflowInstance = instance as unknown as WorkflowInstance;

      if (workflowInstance.status !== 'IN_PROGRESS') {
        logger.info('Workflow not in progress, skipping execution', { instanceId });
        return;
      }

      // Fetch workflow definition
      const { data: workflow } = await supabaseAdmin
        .from('workflow_definitions')
        .select('*')
        .eq('id', workflowInstance.workflowDefinitionId)
        .single();

      if (!workflow) {
        throw new Error('Workflow definition not found');
      }

      const workflowDef = workflow as unknown as WorkflowDefinition;

      // Get current node
      const currentNode = workflowDef.nodes.find(
        n => n.id === workflowInstance.currentNodeId
      );

      if (!currentNode) {
        throw new Error('Current node not found');
      }

      logger.info('Executing node', {
        instanceId,
        nodeId: currentNode.id,
        nodeType: currentNode.type,
      });

      // Execute node
      const result = await this.executeNode(currentNode, workflowInstance, workflowDef);

      // Log execution
      const logEntry = {
        nodeId: currentNode.id,
        nodeName: currentNode.label,
        status: 'COMPLETED' as const,
        startedAt: new Date(),
        completedAt: new Date(),
        output: result,
      };

      workflowInstance.executionLog.push(logEntry);
      workflowInstance.currentStepNumber += 1;

      // Update instance
      await supabaseAdmin
        .from('workflow_instances')
        .update({
          executionLog: workflowInstance.executionLog,
          currentStepNumber: workflowInstance.currentStepNumber,
          context: workflowInstance.context,
          variables: workflowInstance.variables,
        })
        .eq('id', instanceId);

      // Determine next node
      const nextNodeId = result.nextNodeId;

      if (!nextNodeId || currentNode.type === WorkflowNodeType.END) {
        // Workflow completed
        await this.completeWorkflow(instanceId, 'SUCCESS');
        return;
      }

      // Update current node and continue
      await supabaseAdmin
        .from('workflow_instances')
        .update({ currentNodeId: nextNodeId })
        .eq('id', instanceId);

      // Execute next node
      await this.executeNextNode(instanceId);
    } catch (error: any) {
      logger.error('Failed to execute node', {
        error: error.message,
        instanceId,
      });

      // Log error
      await supabaseAdmin
        .from('workflow_instances')
        .update({
          status: 'FAILED',
          errors: [
            {
              nodeId: '',
              error: error.message,
              timestamp: new Date(),
              retryCount: 0,
            },
          ],
        })
        .eq('id', instanceId);
    }
  }

  /**
   * Execute a single node based on its type
   */
  private async executeNode(
    node: WorkflowNode,
    instance: WorkflowInstance,
    workflow: WorkflowDefinition
  ): Promise<{ nextNodeId?: string; output?: any }> {
    switch (node.type) {
      case WorkflowNodeType.START:
        return this.executeStartNode(node, instance, workflow);

      case WorkflowNodeType.END:
        return this.executeEndNode(node, instance);

      case WorkflowNodeType.SEND_EMAIL:
        return this.executeSendEmailNode(node, instance);

      case WorkflowNodeType.SEND_WHATSAPP:
        return this.executeSendWhatsAppNode(node, instance);

      case WorkflowNodeType.SEND_SMS:
        return this.executeSendSMSNode(node, instance);

      case WorkflowNodeType.MAKE_CALL:
        return this.executeMakeCallNode(node, instance);

      case WorkflowNodeType.CREATE_TASK:
        return this.executeCreateTaskNode(node, instance);

      case WorkflowNodeType.CONDITION:
        return this.executeConditionNode(node, instance);

      case WorkflowNodeType.DELAY:
        return this.executeDelayNode(node, instance);

      case WorkflowNodeType.ESCALATE:
        return this.executeEscalateNode(node, instance);

      default:
        logger.warn('Unknown node type, skipping', { nodeType: node.type });
        return this.getNextNode(node.id, workflow);
    }
  }

  /**
   * Execute START node
   */
  private async executeStartNode(
    node: WorkflowNode,
    instance: WorkflowInstance,
    workflow: WorkflowDefinition
  ): Promise<{ nextNodeId?: string }> {
    logger.info('Starting workflow execution', { instanceId: instance.id });
    return this.getNextNode(node.id, workflow);
  }

  /**
   * Execute END node
   */
  private async executeEndNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    logger.info('Workflow execution complete', { instanceId: instance.id });
    return {};
  }

  /**
   * Execute SEND_EMAIL node
   */
  private async executeSendEmailNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    const config = node.config as any;

    // TODO: Implement email sending via Nodemailer
    logger.info('Sending email', {
      to: config.to,
      subject: config.subject,
    });

    return { nextNodeId: config.nextNodeId };
  }

  /**
   * Execute SEND_WHATSAPP node
   */
  private async executeSendWhatsAppNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string; output?: any }> {
    const config = node.config as any;

    // Resolve template variables
    const to = this.resolveVariable(config.to, instance);
    const text = this.resolveVariable(config.content.text, instance);

    const result = await exotelWhatsApp.sendTextMessage({
      to,
      text,
      customData: instance.id,
    });

    return { nextNodeId: config.nextNodeId, output: result };
  }

  /**
   * Execute SEND_SMS node
   */
  private async executeSendSMSNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    const config = node.config as any;

    // TODO: Implement SMS sending via Exotel
    logger.info('Sending SMS', { to: config.to });

    return { nextNodeId: config.nextNodeId };
  }

  /**
   * Execute MAKE_CALL node
   */
  private async executeMakeCallNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string; output?: any }> {
    const config = node.config as any;

    const to = this.resolveVariable(config.to, instance);
    const from = config.from;

    const result = await exotelTelephony.makeCall({
      from,
      to,
      virtualNumber: config.from,
      record: config.recording,
      customField: instance.id,
    });

    return { nextNodeId: config.nextNodeId, output: result };
  }

  /**
   * Execute CREATE_TASK node
   */
  private async executeCreateTaskNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    const config = node.config as any;

    // Create task/action in database
    const task = {
      thread_id: instance.threadId,
      type: config.taskType,
      title: config.title,
      description: config.description,
      priority: config.priority,
      assigned_to: config.assignTo,
      due_at: config.dueInMinutes
        ? new Date(Date.now() + config.dueInMinutes * 60000)
        : null,
    };

    await supabaseAdmin.from('communication_actions').insert(task);

    return { nextNodeId: config.nextNodeId };
  }

  /**
   * Execute CONDITION node
   */
  private async executeConditionNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    const config = node.config as any;

    // Evaluate conditions
    const result = this.evaluateConditions(config.conditions, instance);

    const nextNodeId = result ? config.branches.true : config.branches.false;

    return { nextNodeId };
  }

  /**
   * Execute DELAY node
   */
  private async executeDelayNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    const config = node.config as any;

    // For now, we'll pause the workflow
    // In production, use a scheduler or queue
    await supabaseAdmin
      .from('workflow_instances')
      .update({
        status: 'PAUSED',
        pausedAt: new Date(),
      })
      .eq('id', instance.id);

    // Schedule resumption (TODO: implement with cron or queue)
    logger.info('Workflow paused for delay', {
      instanceId: instance.id,
      delayMinutes: config.delayMinutes,
    });

    return { nextNodeId: config.nextNodeId };
  }

  /**
   * Execute ESCALATE node
   */
  private async executeEscalateNode(
    node: WorkflowNode,
    instance: WorkflowInstance
  ): Promise<{ nextNodeId?: string }> {
    const config = node.config as any;

    // Create escalation notification
    // Update thread priority
    // Notify via configured channels

    logger.info('Escalating workflow', {
      instanceId: instance.id,
      escalateTo: config.escalateTo,
    });

    return { nextNodeId: config.nextNodeId };
  }

  /**
   * Complete workflow
   */
  private async completeWorkflow(
    instanceId: string,
    outcome: 'SUCCESS' | 'FAILURE'
  ): Promise<void> {
    await supabaseAdmin
      .from('workflow_instances')
      .update({
        status: 'COMPLETED',
        completedAt: new Date(),
      })
      .eq('id', instanceId);

    logger.info('Workflow completed', { instanceId, outcome });

    // Emit WebSocket event
    io.emit('workflow:completed', { instanceId, outcome });
  }

  /**
   * Get next node in workflow
   */
  private getNextNode(
    currentNodeId: string,
    workflow: WorkflowDefinition
  ): { nextNodeId?: string } {
    const edge = workflow.edges.find(e => e.source === currentNodeId);
    return { nextNodeId: edge?.target };
  }

  /**
   * Resolve template variables
   */
  private resolveVariable(value: string, instance: WorkflowInstance): string {
    if (!value) return value;

    let resolved = value;

    // Replace {{variable}} with actual values from context
    const matches = value.match(/\{\{([^}]+)\}\}/g);
    if (matches) {
      matches.forEach(match => {
        const key = match.replace(/\{\{|\}\}/g, '').trim();
        const val = this.getNestedValue(instance.context, key) ||
                   this.getNestedValue(instance.variables, key) ||
                   '';
        resolved = resolved.replace(match, String(val));
      });
    }

    return resolved;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Evaluate conditions
   */
  private evaluateConditions(conditions: any[], instance: WorkflowInstance): boolean {
    // Simple condition evaluation
    // TODO: Implement more complex logic
    return conditions.every(cond => {
      const value = this.getNestedValue(instance.context, cond.field);

      switch (cond.operator) {
        case 'equals':
          return value === cond.value;
        case 'not_equals':
          return value !== cond.value;
        case 'greater_than':
          return value > cond.value;
        case 'less_than':
          return value < cond.value;
        case 'contains':
          return String(value).includes(cond.value);
        default:
          return false;
      }
    });
  }
}

export default new WorkflowEngine();
