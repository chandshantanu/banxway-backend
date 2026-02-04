import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';

export interface AgentApprovalRule {
    id?: string;
    agent_id: string;
    suggestion_type?: string;
    auto_approve_threshold: number;
    require_review_threshold: number;
    escalate_below_threshold: number;
    escalate_to_role?: string;
}

/**
 * Service for managing agent-specific approval rules and thresholds
 */
export class AgentRulesService {
    /**
     * Get approval rules for an agent
     */
    async getRulesForAgent(agentId: string, suggestionType?: string): Promise<AgentApprovalRule | null> {
        try {
            let query = supabaseAdmin
                .from('agent_approval_rules')
                .select('*')
                .eq('agent_id', agentId);

            if (suggestionType) {
                query = query.eq('suggestion_type', suggestionType);
            }

            const { data, error } = await query.single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                throw error;
            }

            return data;
        } catch (error: any) {
            logger.error('Error fetching agent rules', { agentId, error: error.message });
            return null;
        }
    }

    /**
     * Create or update approval rules for an agent
     */
    async upsertRules(rules: AgentApprovalRule): Promise<AgentApprovalRule> {
        try {
            const { data, error } = await supabaseAdmin
                .from('agent_approval_rules')
                .upsert({
                    agent_id: rules.agent_id,
                    suggestion_type: rules.suggestion_type,
                    auto_approve_threshold: rules.auto_approve_threshold,
                    require_review_threshold: rules.require_review_threshold,
                    escalate_below_threshold: rules.escalate_below_threshold,
                    escalate_to_role: rules.escalate_to_role,
                })
                .select()
                .single();

            if (error) throw error;

            logger.info('Agent rules updated', { agentId: rules.agent_id });

            return data;
        } catch (error: any) {
            logger.error('Error upserting agent rules', {
                agentId: rules.agent_id,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get all agent rules
     */
    async getAllRules(): Promise<AgentApprovalRule[]> {
        try {
            const { data, error } = await supabaseAdmin
                .from('agent_approval_rules')
                .select('*')
                .order('agent_id');

            if (error) throw error;

            return data || [];
        } catch (error: any) {
            logger.error('Error fetching all agent rules', { error: error.message });
            throw error;
        }
    }

    /**
     * Delete agent rules
     */
    async deleteRules(agentId: string, suggestionType?: string): Promise<void> {
        try {
            let query = supabaseAdmin
                .from('agent_approval_rules')
                .delete()
                .eq('agent_id', agentId);

            if (suggestionType) {
                query = query.eq('suggestion_type', suggestionType);
            }

            const { error } = await query;

            if (error) throw error;

            logger.info('Agent rules deleted', { agentId, suggestionType });
        } catch (error: any) {
            logger.error('Error deleting agent rules', {
                agentId,
                error: error.message,
            });
            throw error;
        }
    }
}

export default new AgentRulesService();
