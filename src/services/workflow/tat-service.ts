import { supabaseAdmin } from '../../config/database.config';
import { logger } from '../../utils/logger';
import { io } from '../../index';

/**
 * TAT (Turn Around Time) Service
 *
 * Manages TAT calculation, monitoring, and status updates for workflows.
 * Tracks approaching and breached deadlines to enable proactive escalation.
 */

export interface SLAConfig {
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  afterMinutes: number;
  escalateTo: string[];
  notifyVia: ('EMAIL' | 'SMS' | 'WHATSAPP' | 'CALL')[];
}

export interface TATDeadline {
  deadlineAt: Date;
  warningThresholdAt: Date;
  criticalThresholdAt: Date;
  totalMinutes: number;
}

export interface ApproachingDeadline {
  id: string;
  workflowDefinitionId: string;
  workflowName: string;
  entityType: string;
  entityId: string;
  threadId?: string;
  shipmentId?: string;
  assignedTo?: string;
  timeRemaining: number; // minutes
  thresholdPercentage: number; // 80%, 90%, etc.
  escalationRule?: EscalationRule;
  startedAt: Date;
}

export interface BreachedDeadline {
  id: string;
  workflowDefinitionId: string;
  workflowName: string;
  entityType: string;
  entityId: string;
  threadId?: string;
  shipmentId?: string;
  assignedTo?: string;
  overdueMinutes: number;
  escalationWorkflowId?: string;
  escalationRule?: EscalationRule;
  startedAt: Date;
}

export interface TATExtension {
  threadId: string;
  oldDeadline: Date;
  newDeadline: Date;
  extensionMinutes: number;
  reason: string;
  extendedAt: Date;
}

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export class TATService {
  /**
   * Calculate TAT deadline based on workflow start time, SLA config, and priority
   *
   * Priority adjustments:
   * - CRITICAL: 25% of standard TAT
   * - HIGH: 50% of standard TAT
   * - MEDIUM: 100% of standard TAT (no adjustment)
   * - LOW: 150% of standard TAT
   */
  calculateTATDeadline(
    startTime: Date,
    slaConfig: SLAConfig,
    priority: Priority = 'MEDIUM'
  ): TATDeadline {
    if (!slaConfig.resolutionTimeMinutes) {
      throw new Error('Invalid SLA configuration: resolutionTimeMinutes is required');
    }

    // Apply priority multiplier
    let totalMinutes = slaConfig.resolutionTimeMinutes;

    switch (priority) {
      case 'CRITICAL':
        totalMinutes = totalMinutes * 0.25; // 25% of standard
        break;
      case 'HIGH':
        totalMinutes = totalMinutes * 0.5; // 50% of standard
        break;
      case 'LOW':
        totalMinutes = totalMinutes * 1.5; // 150% of standard
        break;
      case 'MEDIUM':
      default:
        // No adjustment for MEDIUM priority
        break;
    }

    const deadlineAt = new Date(startTime.getTime() + totalMinutes * 60 * 1000);
    const warningThresholdAt = new Date(startTime.getTime() + totalMinutes * 0.8 * 60 * 1000); // 80%
    const criticalThresholdAt = new Date(startTime.getTime() + totalMinutes * 0.9 * 60 * 1000); // 90%

    return {
      deadlineAt,
      warningThresholdAt,
      criticalThresholdAt,
      totalMinutes: Math.round(totalMinutes),
    };
  }

  /**
   * Get workflow instances approaching TAT deadline (80-100% threshold)
   */
  async getApproachingDeadlines(): Promise<ApproachingDeadline[]> {
    try {
      const now = new Date();

      // Query workflow instances with TAT deadline within warning threshold
      const { data: instances, error } = await supabaseAdmin
        .from('workflow_instances')
        .select(`
          id,
          workflow_definition_id,
          entity_type,
          entity_id,
          thread_id,
          shipment_id,
          assigned_to,
          status,
          started_at,
          workflow_definitions!inner (
            name,
            sla_config
          )
        `)
        .in('status', ['IN_PROGRESS', 'PAUSED'])
        .lt('started_at', now.toISOString())
        .gt('started_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days

      if (error) {
        logger.error('Error fetching approaching deadlines', { error: error.message });
        throw new Error('Failed to fetch approaching deadlines');
      }

      if (!instances || instances.length === 0) {
        return [];
      }

      // Filter instances approaching deadline
      const approaching: ApproachingDeadline[] = [];

      for (const instance of instances) {
        const slaConfig = (instance as any).workflow_definitions?.sla_config;
        if (!slaConfig || !slaConfig.resolutionTimeMinutes) {
          continue;
        }

        const startedAt = new Date(instance.started_at);
        const deadline = this.calculateTATDeadline(
          startedAt,
          slaConfig,
          'MEDIUM' // Default to MEDIUM, can be enhanced to read from instance
        );

        const timeRemaining = Math.floor((deadline.deadlineAt.getTime() - now.getTime()) / (60 * 1000));

        // Check if within warning threshold (0-20% time remaining)
        if (timeRemaining > 0 && now >= deadline.warningThresholdAt && now < deadline.deadlineAt) {
          const percentageRemaining = (timeRemaining / deadline.totalMinutes) * 100;

          // Find applicable escalation rule
          const escalationRule = slaConfig.escalationRules?.find(
            (rule: EscalationRule) => rule.afterMinutes <= (deadline.totalMinutes - timeRemaining)
          );

          approaching.push({
            id: instance.id,
            workflowDefinitionId: instance.workflow_definition_id,
            workflowName: (instance as any).workflow_definitions?.name || 'Unknown Workflow',
            entityType: instance.entity_type,
            entityId: instance.entity_id,
            threadId: instance.thread_id,
            shipmentId: instance.shipment_id,
            assignedTo: instance.assigned_to,
            timeRemaining,
            thresholdPercentage: Math.round(percentageRemaining),
            escalationRule,
            startedAt,
          });
        }
      }

      return approaching;
    } catch (error: any) {
      logger.error('Failed to get approaching deadlines', { error: error.message });
      throw error;
    }
  }

  /**
   * Get workflow instances that have breached TAT deadline (>100% threshold)
   */
  async getBreachedDeadlines(): Promise<BreachedDeadline[]> {
    try {
      const now = new Date();

      // Query workflow instances past deadline
      const { data: instances, error } = await supabaseAdmin
        .from('workflow_instances')
        .select(`
          id,
          workflow_definition_id,
          entity_type,
          entity_id,
          thread_id,
          shipment_id,
          assigned_to,
          status,
          started_at,
          workflow_definitions!inner (
            name,
            sla_config,
            escalation_workflow_id
          )
        `)
        .in('status', ['IN_PROGRESS', 'PAUSED'])
        .lt('started_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days

      if (error) {
        logger.error('Error fetching breached deadlines', { error: error.message });
        throw new Error('Failed to fetch breached deadlines');
      }

      if (!instances || instances.length === 0) {
        return [];
      }

      // Filter instances past deadline
      const breached: BreachedDeadline[] = [];

      for (const instance of instances) {
        const slaConfig = (instance as any).workflow_definitions?.sla_config;
        if (!slaConfig || !slaConfig.resolutionTimeMinutes) {
          continue;
        }

        const startedAt = new Date(instance.started_at);
        const deadline = this.calculateTATDeadline(
          startedAt,
          slaConfig,
          'MEDIUM' // Default to MEDIUM
        );

        const overdueMinutes = Math.floor((now.getTime() - deadline.deadlineAt.getTime()) / (60 * 1000));

        // Check if breached (past deadline)
        if (overdueMinutes > 0) {
          // Find applicable escalation rule based on overdue time
          const escalationRule = slaConfig.escalationRules
            ?.sort((a: EscalationRule, b: EscalationRule) => b.afterMinutes - a.afterMinutes)
            ?.find((rule: EscalationRule) => overdueMinutes >= (rule.afterMinutes - deadline.totalMinutes));

          breached.push({
            id: instance.id,
            workflowDefinitionId: instance.workflow_definition_id,
            workflowName: (instance as any).workflow_definitions?.name || 'Unknown Workflow',
            entityType: instance.entity_type,
            entityId: instance.entity_id,
            threadId: instance.thread_id,
            shipmentId: instance.shipment_id,
            assignedTo: instance.assigned_to,
            overdueMinutes,
            escalationWorkflowId: (instance as any).workflow_definitions?.escalation_workflow_id,
            escalationRule,
            startedAt,
          });
        }
      }

      return breached;
    } catch (error: any) {
      logger.error('Failed to get breached deadlines', { error: error.message });
      throw error;
    }
  }

  /**
   * Update TAT status for a thread
   *
   * Status values:
   * - ON_TRACK: Within normal TAT
   * - AT_RISK: Approaching deadline (80-100%)
   * - BREACHED: Past deadline (>100%)
   */
  async updateTATStatus(
    threadId: string,
    status: 'ON_TRACK' | 'AT_RISK' | 'BREACHED'
  ): Promise<void> {
    try {
      const updates: any = {
        tat_status: status,
      };

      // If breached, also update SLA status
      if (status === 'BREACHED') {
        updates.sla_status = 'BREACHED';
      }

      const { data, error } = await supabaseAdmin
        .from('communication_threads')
        .update(updates)
        .eq('id', threadId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Thread not found');
        }
        logger.error('Error updating TAT status', { threadId, status, error: error.message });
        throw new Error('Failed to update TAT status');
      }

      if (!data) {
        throw new Error('Thread not found');
      }

      logger.info('TAT status updated', { threadId, status });

      // Emit WebSocket event for real-time updates
      io.emit('tat:status:updated', {
        threadId,
        status,
        updatedAt: new Date(),
      });
    } catch (error: any) {
      logger.error('Failed to update TAT status', { threadId, status, error: error.message });
      throw error;
    }
  }

  /**
   * Extend TAT deadline by specified minutes
   *
   * Used for human-approved extensions or special circumstances
   */
  async extendTATDeadline(
    threadId: string,
    extensionMinutes: number,
    reason: string
  ): Promise<TATExtension> {
    try {
      if (extensionMinutes <= 0) {
        throw new Error('Extension minutes must be positive');
      }

      // Fetch current thread with deadline
      const { data: thread, error: fetchError } = await supabaseAdmin
        .from('communication_threads')
        .select('id, sla_deadline, tat_status')
        .eq('id', threadId)
        .single();

      if (fetchError || !thread) {
        throw new Error('Thread not found');
      }

      const oldDeadline = thread.sla_deadline ? new Date(thread.sla_deadline) : new Date();
      const newDeadline = new Date(oldDeadline.getTime() + extensionMinutes * 60 * 1000);

      // Update deadline
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('communication_threads')
        .update({
          sla_deadline: newDeadline.toISOString(),
          tat_status: 'ON_TRACK', // Reset to ON_TRACK after extension
        })
        .eq('id', threadId)
        .select()
        .single();

      if (updateError || !updated) {
        throw new Error('Failed to extend TAT deadline');
      }

      logger.info('TAT deadline extended', {
        threadId,
        extensionMinutes,
        oldDeadline: oldDeadline.toISOString(),
        newDeadline: newDeadline.toISOString(),
        reason,
      });

      // Emit WebSocket event
      io.emit('tat:deadline:extended', {
        threadId,
        oldDeadline,
        newDeadline,
        extensionMinutes,
        reason,
        extendedAt: new Date(),
      });

      return {
        threadId,
        oldDeadline,
        newDeadline,
        extensionMinutes,
        reason,
        extendedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to extend TAT deadline', { threadId, extensionMinutes, error: error.message });
      throw error;
    }
  }
}

export default new TATService();
