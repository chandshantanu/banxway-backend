import { supabaseAdmin } from '../../config/database.config';
import { WorkflowNode } from '../../types/workflow';
import { ManualDataEntryNodeConfig } from '../../types/workflow-integration-nodes';
import { logger } from '../../utils/logger';

/**
 * ManualDataEntryHandler
 * Handles manual data entry nodes in workflows
 * Creates form entries and waits for user submission
 */
export class ManualDataEntryHandler {
    async execute(
        node: WorkflowNode,
        workflowInstanceId: string,
        context: Record<string, any>
    ): Promise<{ success: boolean; data?: any; error?: string; waitForInput?: boolean }> {
        const config = node.config as ManualDataEntryNodeConfig;

        try {
            logger.info('Executing manual data entry node', {
                nodeId: node.id,
                workflowInstanceId,
                formTitle: config.formTitle,
            });

            // Check if entry already exists and is completed
            const { data: existingEntry } = await supabaseAdmin
                .from('workflow_manual_entries')
                .select('*')
                .eq('workflow_instance_id', workflowInstanceId)
                .eq('node_id', node.id)
                .single();

            if (existingEntry?.status === 'COMPLETED') {
                logger.info('Manual entry already completed', {
                    entryId: existingEntry.id,
                    submittedBy: existingEntry.submitted_by,
                });

                // Return submitted data
                return {
                    success: true,
                    data: existingEntry.submitted_data,
                };
            }

            // Create or update pending entry
            const entryData = {
                workflow_instance_id: workflowInstanceId,
                node_id: node.id,
                form_schema: config.formSchema,
                form_ui_schema: {
                    title: config.formTitle || 'Manual Data Entry',
                    description: config.formDescription,
                    submitButtonText: config.submitButtonText || 'Submit',
                },
                status: 'PENDING',
            };

            if (existingEntry) {
                // Update existing entry
                await supabaseAdmin
                    .from('workflow_manual_entries')
                    .update(entryData)
                    .eq('id', existingEntry.id);
            } else {
                // Create new entry
                await supabaseAdmin
                    .from('workflow_manual_entries')
                    .insert(entryData);
            }

            logger.info('Manual data entry pending user input', {
                nodeId: node.id,
                workflowInstanceId,
            });

            // Return waiting status
            return {
                success: true,
                waitForInput: true,
                data: { message: 'Waiting for manual data entry' },
            };
        } catch (error: any) {
            logger.error('Error executing manual data entry node', {
                nodeId: node.id,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Submit manual data entry
     */
    async submitEntry(
        entryId: string,
        data: Record<string, any>,
        userId: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Validate against schema
            const { data: entry } = await supabaseAdmin
                .from('workflow_manual_entries')
                .select('form_schema')
                .eq('id', entryId)
                .single();

            if (!entry) {
                throw new Error('Entry not found');
            }

            // TODO: Add JSON schema validation here
            // For now, just accept the data

            // Update entry with submitted data
            const { error } = await supabaseAdmin
                .from('workflow_manual_entries')
                .update({
                    submitted_data: data,
                    submitted_by: userId,
                    submitted_at: new Date().toISOString(),
                    status: 'COMPLETED',
                })
                .eq('id', entryId);

            if (error) throw error;

            logger.info('Manual entry submitted successfully', {
                entryId,
                userId,
            });

            return { success: true };
        } catch (error: any) {
            logger.error('Error submitting manual entry', {
                entryId,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
            };
        }
    }
}

export default new ManualDataEntryHandler();
