import { supabaseAdmin } from '../config/database.config';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

export interface AISuggestion {
    id?: string;
    workflow_instance_id: string;
    node_id?: string;
    suggestion_type: 'EMAIL_DRAFT' | 'NEXT_STEP' | 'DATA_EXTRACTION' | 'QUOTATION_DRAFT' | 'DOCUMENT_CLASSIFICATION';
    suggestion_data: Record<string, any>;
    confidence_score: number;
    guard_rail_checks?: Record<string, any>;
    requires_approval?: boolean;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED';
    approved_by?: string;
    approved_at?: string;
    rejection_reason?: string;
    edited_data?: Record<string, any>;
}

export interface ApprovalRules {
    auto_approve_threshold: number;
    require_review_threshold: number;
    escalate_below_threshold: number;
    escalate_to_role?: string;
}

/**
 * AISuggestionService
 * Handles AI suggestion submission, approval, and confidence-based routing
 */
export class AISuggestionService {
    private defaultRules: ApprovalRules = {
        auto_approve_threshold: 0.90,
        require_review_threshold: 0.70,
        escalate_below_threshold: 0.50,
        escalate_to_role: 'manager',
    };

    /**
     * Submit AI suggestion from agent
     */
    async submitSuggestion(suggestion: AISuggestion): Promise<{
        suggestion_id: string;
        status: string;
        routed_to: 'auto_approved' | 'queue' | 'escalated';
        assigned_to?: string;
    }> {
        try {
            // Validate confidence score
            if (suggestion.confidence_score < 0 || suggestion.confidence_score > 1) {
                throw new AppError('Invalid confidence score. Must be between 0 and 1.', 400, 'INVALID_CONFIDENCE');
            }

            // Get approval rules (using defaults for now)
            const rules = this.defaultRules;

            // Determine routing based on confidence
            const routing = this.routeByConfidence(suggestion.confidence_score, rules);

            // Auto-approve if confidence is high enough
            if (routing.action === 'auto_approve') {
                return await this.autoApproveSuggestion(suggestion);
            }

            // Otherwise, create pending suggestion
            const { data, error } = await supabaseAdmin
                .from('workflow_ai_suggestions')
                .insert({
                    workflow_instance_id: suggestion.workflow_instance_id,
                    node_id: suggestion.node_id,
                    suggestion_type: suggestion.suggestion_type,
                    suggestion_data: suggestion.suggestion_data,
                    confidence_score: suggestion.confidence_score,
                    guard_rail_checks: suggestion.guard_rail_checks,
                    requires_approval: true,
                    status: 'PENDING',
                })
                .select()
                .single();

            if (error) throw error;

            logger.info('AI suggestion submitted for review', {
                suggestionId: data.id,
                type: suggestion.suggestion_type,
                confidence: suggestion.confidence_score,
                routing: routing.action,
            });

            return {
                suggestion_id: data.id,
                status: 'pending_review',
                routed_to: routing.action === 'escalate' ? 'escalated' : 'queue',
                assigned_to: routing.action === 'escalate' ? rules.escalate_to_role : undefined,
            };
        } catch (error: any) {
            logger.error('Error submitting AI suggestion', {
                error: error.message,
                suggestion: suggestion.suggestion_type,
            });
            throw error;
        }
    }

    /**
     * Approve AI suggestion
     */
    async approveSuggestion(
        suggestionId: string,
        userId: string,
        editedData?: Record<string, any>
    ): Promise<{ success: boolean; data?: any }> {
        try {
            const updateData: any = {
                status: editedData ? 'EDITED' : 'APPROVED',
                approved_by: userId,
                approved_at: new Date().toISOString(),
            };

            if (editedData) {
                updateData.edited_data = editedData;
            }

            const { data, error } = await supabaseAdmin
                .from('workflow_ai_suggestions')
                .update(updateData)
                .eq('id', suggestionId)
                .select()
                .single();

            if (error) throw error;

            logger.info('AI suggestion approved', {
                suggestionId,
                userId,
                wasEdited: !!editedData,
            });

            // Trigger webhook notification to agent
            await this.notifyAgent(data, 'approved');

            return { success: true, data };
        } catch (error: any) {
            logger.error('Error approving suggestion', {
                suggestionId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Reject AI suggestion
     */
    async rejectSuggestion(
        suggestionId: string,
        userId: string,
        reason: string
    ): Promise<{ success: boolean }> {
        try {
            const { data, error } = await supabaseAdmin
                .from('workflow_ai_suggestions')
                .update({
                    status: 'REJECTED',
                    approved_by: userId,
                    approved_at: new Date().toISOString(),
                    rejection_reason: reason,
                })
                .eq('id', suggestionId)
                .select()
                .single();

            if (error) throw error;

            logger.info('AI suggestion rejected', {
                suggestionId,
                userId,
                reason,
            });

            // Trigger webhook notification to agent
            await this.notifyAgent(data, 'rejected');

            return { success: true };
        } catch (error: any) {
            logger.error('Error rejecting suggestion', {
                suggestionId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get pending suggestions
     */
    async getPendingSuggestions(filters?: {
        suggestion_type?: string;
        min_confidence?: number;
        max_confidence?: number;
    }): Promise<any[]> {
        try {
            let query = supabaseAdmin
                .from('workflow_ai_suggestions')
                .select(`
          *,
          workflow_instances!inner(
            id,
            workflow_definition:workflow_definitions(name, category)
          )
        `)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true });

            if (filters?.suggestion_type) {
                query = query.eq('suggestion_type', filters.suggestion_type);
            }

            if (filters?.min_confidence !== undefined) {
                query = query.gte('confidence_score', filters.min_confidence);
            }

            if (filters?.max_confidence !== undefined) {
                query = query.lte('confidence_score', filters.max_confidence);
            }

            const { data, error } = await query;

            if (error) throw error;

            return data || [];
        } catch (error: any) {
            logger.error('Error fetching pending suggestions', {
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get suggestion by ID
     */
    async getSuggestionById(suggestionId: string): Promise<any> {
        try {
            const { data, error } = await supabaseAdmin
                .from('workflow_ai_suggestions')
                .select('*')
                .eq('id', suggestionId)
                .single();

            if (error) throw error;

            return data;
        } catch (error: any) {
            logger.error('Error fetching suggestion', {
                suggestionId,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Get dashboard statistics
     */
    async getDashboardStats(): Promise<{
        total_pending: number;
        by_confidence: { high: number; medium: number; low: number };
        approval_rate_24h: number;
        avg_review_time_seconds: number;
    }> {
        try {
            // Get pending count
            const { data: pending } = await supabaseAdmin
                .from('workflow_ai_suggestions')
                .select('confidence_score', { count: 'exact' })
                .eq('status', 'PENDING');

            // Count by confidence levels
            const byConfidence = {
                high: pending?.filter(s => s.confidence_score >= 0.90).length || 0,
                medium: pending?.filter(s => s.confidence_score >= 0.70 && s.confidence_score < 0.90).length || 0,
                low: pending?.filter(s => s.confidence_score < 0.70).length || 0,
            };

            // Get approval rate last 24h
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: last24h } = await supabaseAdmin
                .from('workflow_ai_suggestions')
                .select('status')
                .gte('created_at', oneDayAgo);

            const approved = last24h?.filter(s => s.status === 'APPROVED' || s.status === 'EDITED').length || 0;
            const total = last24h?.length || 1;
            const approvalRate = approved / total;

            // Calculate avg review time (mock for now)
            const avgReviewTime = 45; // seconds

            return {
                total_pending: pending?.length || 0,
                by_confidence: byConfidence,
                approval_rate_24h: approvalRate,
                avg_review_time_seconds: avgReviewTime,
            };
        } catch (error: any) {
            logger.error('Error fetching dashboard stats', {
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Confidence-based routing logic
     */
    private routeByConfidence(
        confidence: number,
        rules: ApprovalRules
    ): { action: 'auto_approve' | 'queue' | 'escalate' } {
        if (confidence >= rules.auto_approve_threshold) {
            return { action: 'auto_approve' };
        } else if (confidence >= rules.require_review_threshold) {
            return { action: 'queue' };
        } else {
            return { action: 'escalate' };
        }
    }

    /**
     * Auto-approve high-confidence suggestion
     */
    private async autoApproveSuggestion(suggestion: AISuggestion): Promise<{
        suggestion_id: string;
        status: string;
        routed_to: 'auto_approved';
    }> {
        const { data, error } = await supabaseAdmin
            .from('workflow_ai_suggestions')
            .insert({
                workflow_instance_id: suggestion.workflow_instance_id,
                node_id: suggestion.node_id,
                suggestion_type: suggestion.suggestion_type,
                suggestion_data: suggestion.suggestion_data,
                confidence_score: suggestion.confidence_score,
                guard_rail_checks: suggestion.guard_rail_checks,
                requires_approval: false,
                status: 'APPROVED',
                approved_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) throw error;

        logger.info('AI suggestion auto-approved', {
            suggestionId: data.id,
            confidence: suggestion.confidence_score,
        });

        // Trigger webhook notification to agent
        await this.notifyAgent(data, 'approved');

        return {
            suggestion_id: data.id,
            status: 'auto_approved',
            routed_to: 'auto_approved',
        };
    }

    /**
     * Notify agent via webhook
     */
    private async notifyAgent(suggestion: any, event: 'approved' | 'rejected'): Promise<void> {
        try {
            // TODO: Implement webhook notification to agent
            // For now, just log
            logger.info('Agent webhook notification', {
                suggestionId: suggestion.id,
                event,
                status: suggestion.status,
            });

            // In production, would call:
            // await fetch(agentWebhookUrl, {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   body: JSON.stringify({ event, suggestion })
            // });
        } catch (error: any) {
            logger.warn('Failed to notify agent', {
                suggestionId: suggestion.id,
                error: error.message,
            });
            // Don't throw - notification failure shouldn't fail the approval
        }
    }
}

export default new AISuggestionService();
