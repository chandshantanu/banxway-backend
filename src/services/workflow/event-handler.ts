// Event Handler Service
// Handles platform events and triggers workflows automatically

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface EventContext {
    eventType: string;
    eventData: any;
    entityType?: string;
    entityId?: string;
}

/**
 * Main event handler - triggers workflows based on events
 */
export async function handleEvent(context: EventContext) {
    console.log(`[EventHandler] Processing event: ${context.eventType}`);

    try {
        // Find matching workflow triggers
        const { data: triggers, error } = await supabase
            .from('workflow_event_triggers')
            .select('*')
            .eq('event_type', context.eventType)
            .eq('is_active', true)
            .order('priority', { ascending: false });

        if (error) {
            console.error('[EventHandler] Error fetching triggers:', error);
            return { success: false, error };
        }

        if (!triggers || triggers.length === 0) {
            console.log(`[EventHandler] No active triggers found for ${context.eventType}`);
            return { success: true, triggeredWorkflows: [] };
        }

        const triggeredWorkflows = [];

        // Process each trigger
        for (const trigger of triggers) {
            const conditionMet = evaluateCondition(trigger.condition_expression, context.eventData);

            if (conditionMet) {
                const instance = await createWorkflowInstance(
                    trigger.workflow_id,
                    context.eventData,
                    context.entityType,
                    context.entityId
                );

                if (instance) {
                    triggeredWorkflows.push(instance.id);
                    console.log(`[EventHandler] Triggered workflow: ${instance.workflow_name} (${instance.id})`);
                }
            }
        }

        return { success: true, triggeredWorkflows };
    } catch (err) {
        console.error('[EventHandler] Exception:', err);
        return { success: false, error: err };
    }
}

/**
 * Event-specific handlers
 */

export async function handleDocumentUploaded(documentData: any) {
    return handleEvent({
        eventType: 'DOCUMENT_UPLOADED',
        eventData: {
            document: documentData,
            shipment_id: documentData.shipment_id,
            customer: documentData.customer
        },
        entityType: 'SHIPMENT',
        entityId: documentData.shipment_id
    });
}

export async function handleStatusChanged(statusData: any) {
    return handleEvent({
        eventType: 'STATUS_CHANGED',
        eventData: {
            shipment: statusData.shipment,
            old_status: statusData.old_status,
            new_status: statusData.new_status,
            customer: statusData.customer
        },
        entityType: 'SHIPMENT',
        entityId: statusData.shipment.id
    });
}

export async function handleQuotationAccepted(quotationData: any) {
    return handleEvent({
        eventType: 'QUOTATION_ACCEPTED',
        eventData: {
            quotation: quotationData,
            customer: quotationData.customer,
            shipment_type: quotationData.shipment_type
        },
        entityType: 'QUOTATION',
        entityId: quotationData.id
    });
}

export async function handleMissedCall(callData: any) {
    return handleEvent({
        eventType: 'MISSED_CALL',
        eventData: {
            call: callData,
            customer_id: callData.customer_id,
            from_number: callData.from_number,
            call_time: callData.call_time
        },
        entityType: 'CUSTOMER',
        entityId: callData.customer_id
    });
}

export async function handleTATWarning(taskData: any) {
    return handleEvent({
        eventType: 'TAT_WARNING',
        eventData: {
            task: taskData,
            shipment_id: taskData.shipment_id,
            priority: taskData.priority,
            tat_remaining_minutes: taskData.tat_remaining_minutes
        },
        entityType: 'SHIPMENT',
        entityId: taskData.shipment_id
    });
}

export async function handleKYCPending(customerData: any) {
    return handleEvent({
        eventType: 'KYC_PENDING',
        eventData: {
            customer: customerData,
            kyc_pending_days: customerData.kyc_pending_days
        },
        entityType: 'CUSTOMER',
        entityId: customerData.id
    });
}

/**
 * Helper: Evaluate condition expression
 * Simplified implementation - production would need full expression parser
 */
function evaluateCondition(conditionExpr: any, data: any): boolean {
    if (!conditionExpr) return true;

    try {
        const condition = typeof conditionExpr === 'string'
            ? JSON.parse(conditionExpr)
            : conditionExpr;

        const fieldValue = getNestedValue(data, condition.field);

        switch (condition.operator) {
            case 'equals':
                return fieldValue === condition.value;
            case 'not_equals':
                return fieldValue !== condition.value;
            case 'greater_than':
                return fieldValue > condition.value;
            case 'less_than':
                return fieldValue < condition.value;
            case 'in':
                return Array.isArray(condition.value) && condition.value.includes(fieldValue);
            case 'contains':
                return String(fieldValue).includes(String(condition.value));
            default:
                return true;
        }
    } catch (err) {
        console.error('[EventHandler] Condition evaluation error:', err);
        return false;
    }
}

/**
 * Helper: Get nested value from object
 */
function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Helper: Create workflow instance
 */
async function createWorkflowInstance(
    workflowId: string,
    eventData: any,
    entityType?: string,
    entityId?: string
) {
    try {
        // Get workflow definition
        const { data: workflow, error: workflowError } = await supabase
            .from('workflow_definitions')
            .select('*')
            .eq('id', workflowId)
            .single();

        if (workflowError || !workflow) {
            console.error('[EventHandler] Workflow not found:', workflowId);
            return null;
        }

        // Create instance
        const { data: instance, error: instanceError } = await supabase
            .from('workflow_instances')
            .insert({
                workflow_id: workflowId,
                workflow_name: workflow.name,
                shipment_id: entityType === 'SHIPMENT' ? entityId : null,
                quotation_id: entityType === 'QUOTATION' ? entityId : null,
                context: eventData,
                status: 'NOT_STARTED'
            })
            .select()
            .single();

        if (instanceError) {
            console.error('[EventHandler] Error creating instance:', instanceError);
            return null;
        }

        return instance;
    } catch (err) {
        console.error('[EventHandler] Exception creating instance:', err);
        return null;
    }
}
