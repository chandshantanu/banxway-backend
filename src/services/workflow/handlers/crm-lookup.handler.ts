import { supabaseAdmin } from '../../config/database.config';
import { WorkflowNode } from '../../types/workflow';
import { CRMLookupNodeConfig } from '../../types/workflow-integration-nodes';
import { logger } from '../../utils/logger';

/**
 * CRMLookupHandler
 * Handles CRM customer lookup operations in workflows
 */
export class CRMLookupHandler {
    async execute(
        node: WorkflowNode,
        workflowInstanceId: string,
        context: Record<string, any>
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        const config = node.config as CRMLookupNodeConfig;

        try {
            logger.info('Executing CRM lookup node', {
                nodeId: node.id,
                lookupBy: config.lookupBy,
            });

            // Resolve template values
            const lookupValue = this.resolveTemplate(config.lookupValue, context);

            // Build query
            let query = supabaseAdmin.from('customers').select('*');

            // Apply lookup criteria
            switch (config.lookupBy) {
                case 'email':
                    query = query.eq('email', lookupValue);
                    break;
                case 'phone':
                    query = query.eq('phone', lookupValue);
                    break;
                case 'pan':
                    query = query.eq('pan_number', lookupValue);
                    break;
                case 'gstin':
                    query = query.eq('gstin', lookupValue);
                    break;
                case 'customer_id':
                    query = query.eq('id', lookupValue);
                    break;
            }

            const { data: customer, error } = await query.single();

            if (error && error.code !== 'PGRST116') {
                // PGRST116 is "not found" error
                throw error;
            }

            if (!customer) {
                logger.info('Customer not found', {
                    lookupBy: config.lookupBy,
                    lookupValue,
                });

                // Handle not found
                if (config.createIfNotFound && config.onNotFound === 'CREATE') {
                    return await this.createCustomer(config, lookupValue, context);
                } else if (config.onNotFound === 'FAIL') {
                    return {
                        success: false,
                        error: `Customer not found by ${config.lookupBy}: ${lookupValue}`,
                    };
                } else {
                    // CONTINUE
                    return {
                        success: true,
                        data: null,
                    };
                }
            }

            logger.info('Customer found', {
                customerId: customer.id,
                email: customer.email,
            });

            return {
                success: true,
                data: customer,
            };
        } catch (error: any) {
            logger.error('Error executing CRM lookup node', {
                nodeId: node.id,
                error: error.message,
            });

            if (config.onError === 'CONTINUE') {
                return { success: true, data: null };
            }

            return {
                success: false,
                error: error.message,
            };
        }
    }

    private async createCustomer(
        config: CRMLookupNodeConfig,
        lookupValue: string,
        context: Record<string, any>
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const customerData: any = {};

            // Set lookup field
            if (config.lookupBy === 'email') {
                customerData.email = lookupValue;
            } else if (config.lookupBy === 'phone') {
                customerData.phone = lookupValue;
            }

            // Add required fields from context
            if (config.requiredFields) {
                for (const field of config.requiredFields) {
                    if (context[field]) {
                        customerData[field] = context[field];
                    }
                }
            }

            // Set defaults
            customerData.tier = 'STANDARD';
            customerData.kyc_status = 'NOT_STARTED';
            customerData.is_active = true;

            const { data: newCustomer, error } = await supabaseAdmin
                .from('customers')
                .insert(customerData)
                .select()
                .single();

            if (error) throw error;

            logger.info('Customer created', {
                customerId: newCustomer.id,
                email: newCustomer.email,
            });

            return {
                success: true,
                data: newCustomer,
            };
        } catch (error: any) {
            logger.error('Error creating customer', {
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
            };
        }
    }

    private resolveTemplate(template: string, context: Record<string, any>): string {
        // Simple template resolution: {{context.customer_email}} -> context.customer_email value
        return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const keys = path.trim().split('.');
            let value: any = context;

            for (const key of keys) {
                value = value?.[key];
            }

            return value !== undefined ? String(value) : match;
        });
    }
}

export default new CRMLookupHandler();
