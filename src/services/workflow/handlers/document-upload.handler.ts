import { supabaseAdmin } from '../../../config/database.config';
import { WorkflowNode } from '../../../types/workflow';
import { DocumentUploadNodeConfig } from '../../../types/workflow-integration-nodes';
import { logger } from '../../../utils/logger';

/**
 * DocumentUploadHandler
 * Handles document upload operations in workflows
 */
export class DocumentUploadHandler {
    async execute(
        node: WorkflowNode,
        workflowInstanceId: string,
        context: Record<string, any>
    ): Promise<{ success: boolean; data?: any; error?: string; waitForInput?: boolean }> {
        const config = node.config as DocumentUploadNodeConfig;

        try {
            logger.info('Executing document upload node', {
                nodeId: node.id,
                documentType: config.documentType,
            });

            // Check if document already uploaded
            const { data: existingDoc } = await supabaseAdmin
                .from('customer_kyc_documents')
                .select('*')
                .eq('customer_id', this.resolveTemplate(config.entityId!, context))
                .eq('document_type', config.documentType)
                .single();

            if (existingDoc && existingDoc.status === 'APPROVED') {
                logger.info('Document already uploaded and approved', {
                    documentId: existingDoc.id,
                });

                return {
                    success: true,
                    data: existingDoc,
                };
            }

            // Check if required and not uploaded
            if (config.required && !existingDoc) {
                return {
                    success: true,
                    waitForInput: true,
                    data: {
                        message: 'Waiting for document upload',
                        documentType: config.documentType,
                        allowedFormats: config.allowedFormats,
                        maxSizeMB: config.maxSizeMB,
                    },
                };
            }

            // Document uploaded but not approved yet
            if (existingDoc && existingDoc.status === 'PENDING') {
                return {
                    success: true,
                    waitForInput: true,
                    data: {
                        message: 'Waiting for document verification',
                        documentId: existingDoc.id,
                        status: existingDoc.status,
                    },
                };
            }

            // Not required and not uploaded - continue
            return {
                success: true,
                data: { status: 'NOT_REQUIRED' },
            };
        } catch (error: any) {
            logger.error('Error executing document upload node', {
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
     * Upload document
     */
    async uploadDocument(
        customerId: string,
        documentType: string,
        file: {
            url: string;
            fileName: string;
            fileSize: number;
            fileType: string;
        },
        userId: string
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const { data, error } = await supabaseAdmin
                .from('customer_kyc_documents')
                .upsert({
                    customer_id: customerId,
                    document_type: documentType,
                    document_url: file.url,
                    file_name: file.fileName,
                    file_size: file.fileSize,
                    file_type: file.fileType,
                    uploaded_by: userId,
                    status: 'PENDING',
                })
                .select()
                .single();

            if (error) throw error;

            logger.info('Document uploaded successfully', {
                documentId: data.id,
                customerId,
            });

            return { success: true, data };
        } catch (error: any) {
            logger.error('Error uploading document', {
                customerId,
                error: error.message,
            });

            return {
                success: false,
                error: error.message,
            };
        }
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

export default new DocumentUploadHandler();
