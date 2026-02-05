import { supabaseAdmin } from '../../../config/database.config';
import { WorkflowNode } from '../../../types/workflow';
import { KYCVerificationNodeConfig } from '../../../types/workflow-integration-nodes';
import { logger } from '../../../utils/logger';

/**
 * KYCVerificationHandler
 * Handles KYC verification checks in workflows
 */
export class KYCVerificationHandler {
    async execute(
        node: WorkflowNode,
        workflowInstanceId: string,
        context: Record<string, any>
    ): Promise<{ success: boolean; data?: any; error?: string; waitForInput?: boolean }> {
        const config = node.config as KYCVerificationNodeConfig;

        try {
            logger.info('Executing KYC verification node', {
                nodeId: node.id,
                workflowInstanceId,
            });

            // Resolve customer ID
            const customerId = this.resolveTemplate(config.customerId, context);

            if (!customerId) {
                throw new Error('Customer ID not found in context');
            }

            // Get KYC status
            const kycStatus = await this.checkKYCStatus(customerId, config.requiredDocuments);

            logger.info('KYC status checked', {
                customerId,
                status: kycStatus.status,
                missingDocs: kycStatus.missingDocuments,
            });

            // Handle based on status
            if (kycStatus.status === 'APPROVED') {
                return {
                    success: true,
                    data: {
                        kycStatus: 'APPROVED',
                        documents: kycStatus.approvedDocuments,
                    },
                };
            }

            if (kycStatus.status === 'PENDING') {
                if (config.blockIfIncomplete) {
                    // Wait for KYC completion
                    return {
                        success: true,
                        waitForInput: true,
                        data: {
                            kycStatus: 'PENDING',
                            missingDocuments: kycStatus.missingDocuments,
                            message: 'Waiting for KYC document verification',
                        },
                    };
                } else {
                    // Continue workflow but flag KYC as pending
                    return {
                        success: true,
                        data: {
                            kycStatus: 'PENDING',
                            missingDocuments: kycStatus.missingDocuments,
                        },
                    };
                }
            }

            // NOT_STARTED
            if (config.sendReminder) {
                // TODO: Trigger reminder email/notification
                logger.info('KYC reminder should be sent', { customerId });
            }

            if (config.blockIfIncomplete) {
                return {
                    success: true,
                    waitForInput: true,
                    data: {
                        kycStatus: 'NOT_STARTED',
                        requiredDocuments: config.requiredDocuments,
                        message: 'Waiting for KYC document upload',
                    },
                };
            }

            return {
                success: true,
                data: {
                    kycStatus: 'NOT_STARTED',
                    requiredDocuments: config.requiredDocuments,
                },
            };
        } catch (error: any) {
            logger.error('Error executing KYC verification node', {
                nodeId: node.id,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
            };
        }
    }

    private async checkKYCStatus(
        customerId: string,
        requiredDocs: string[]
    ): Promise<{
        status: 'APPROVED' | 'PENDING' | 'NOT_STARTED';
        approvedDocuments: any[];
        missingDocuments: string[];
    }> {
        // Fetch all KYC documents for customer
        const { data: documents } = await supabaseAdmin
            .from('customer_kyc_documents')
            .select('*')
            .eq('customer_id', customerId)
            .in('document_type', requiredDocs);

        const approvedDocs = documents?.filter((doc) => doc.status === 'APPROVED') || [];
        const pendingDocs = documents?.filter((doc) => doc.status === 'PENDING') || [];

        const approvedTypes = approvedDocs.map((d) => d.document_type);
        const missingTypes = requiredDocs.filter((type) => !approvedTypes.includes(type));

        // Check if all required documents are approved
        if (missingTypes.length === 0) {
            return {
                status: 'APPROVED',
                approvedDocuments: approvedDocs,
                missingDocuments: [],
            };
        }

        // Check if some documents exist but not all approved
        if (documents && documents.length > 0) {
            return {
                status: 'PENDING',
                approvedDocuments: approvedDocs,
                missingDocuments: missingTypes,
            };
        }

        // No documents uploaded
        return {
            status: 'NOT_STARTED',
            approvedDocuments: [],
            missingDocuments: requiredDocs,
        };
    }

    private resolveTemplate(template: string, context: Record<string, any>): string {
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

export default new KYCVerificationHandler();
