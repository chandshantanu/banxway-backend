import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';

export const PIPELINE_STAGES = [
  'INTAKE', 'QUALIFICATION', 'QUOTE', 'NEGOTIATION',
  'ORDER', 'EXECUTION', 'POST_DELIVERY', 'CLOSED',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

export interface StageTransition {
  from: string | null;
  to: string;
  changed_by: string;
  changed_at: string;
  reason?: string;
}

class PipelineService {
  /**
   * Get the current pipeline stage of a thread
   */
  async getStage(threadId: string): Promise<{ stage: string | null; history: StageTransition[] }> {
    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .select('pipeline_stage, stage_history')
      .eq('id', threadId)
      .single();

    if (error) throw error;
    return {
      stage: data?.pipeline_stage || null,
      history: data?.stage_history || [],
    };
  }

  /**
   * Set pipeline stage on a thread (with human approval — called after confirmation)
   */
  async setStage(
    threadId: string,
    newStage: PipelineStage,
    changedBy: string,
    reason?: string
  ): Promise<{ previousStage: string | null; newStage: string }> {
    // Get current state
    const { data: thread, error: fetchError } = await supabaseAdmin
      .from('communication_threads')
      .select('pipeline_stage, stage_history')
      .eq('id', threadId)
      .single();

    if (fetchError) throw fetchError;

    const previousStage = thread?.pipeline_stage || null;
    const history: StageTransition[] = thread?.stage_history || [];

    // Add transition to history
    history.push({
      from: previousStage,
      to: newStage,
      changed_by: changedBy,
      changed_at: new Date().toISOString(),
      reason,
    });

    // Update thread
    const { error: updateError } = await supabaseAdmin
      .from('communication_threads')
      .update({
        pipeline_stage: newStage,
        stage_changed_at: new Date().toISOString(),
        stage_history: JSON.stringify(history),
      })
      .eq('id', threadId);

    if (updateError) throw updateError;

    logger.info('Pipeline stage updated', {
      threadId,
      from: previousStage,
      to: newStage,
      changedBy,
    });

    return { previousStage, newStage };
  }

  /**
   * Suggest a pipeline stage based on email intent
   */
  suggestStage(intent: string | null, hasActiveShipment: boolean): PipelineStage {
    if (hasActiveShipment) return 'EXECUTION';

    switch (intent) {
      case 'quote_request':
      case 'rate_inquiry':
        return 'QUOTE';
      case 'booking':
      case 'booking_confirmation':
        return 'ORDER';
      case 'shipment_update':
      case 'status_inquiry':
        return 'EXECUTION';
      case 'complaint':
      case 'issue':
        return 'POST_DELIVERY';
      case 'document_request':
      case 'document_upload':
        return 'EXECUTION';
      case 'general':
      case 'inquiry':
      default:
        return 'INTAKE';
    }
  }

  /**
   * Get thread counts by pipeline stage
   */
  async getStageCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const stage of PIPELINE_STAGES) {
      counts[stage] = 0;
    }
    counts['UNASSIGNED'] = 0;

    const { data, error } = await supabaseAdmin
      .from('communication_threads')
      .select('pipeline_stage');

    if (error || !data) return counts;

    for (const thread of data as any[]) {
      const stage = thread.pipeline_stage || 'UNASSIGNED';
      counts[stage] = (counts[stage] || 0) + 1;
    }

    return counts;
  }
}

export default new PipelineService();
