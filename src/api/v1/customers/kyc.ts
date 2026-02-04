import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { supabaseAdmin } from '../../../config/database.config';
import { validateRequest } from '../../../utils/validation';
import { ApiResponse } from '../../../types';
import { logger } from '../../../utils/logger';
import { asyncHandler } from '../../../middleware/error.middleware';

const router = Router();

// Validation schemas
const uploadDocumentSchema = z.object({
    document_type: z.string(),
    document_url: z.string().url(),
    file_name: z.string(),
    file_size: z.number().positive(),
    file_type: z.string(),
    document_number: z.string().optional(),
});

const verifyDocumentSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
    verification_notes: z.string().optional(),
});

const bulkUploadSchema = z.object({
    customers: z.array(z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        gstin: z.string().optional(),
        pan_number: z.string().optional(),
        tier: z.enum(['PREMIUM', 'STANDARD', 'BASIC']).optional(),
    })),
});

// ============================================================================
// CUSTOMER KYC ENDPOINTS
// ============================================================================

// POST /api/v1/customers/:id/kyc/documents - Upload KYC document
router.post(
    '/:id/kyc/documents',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id: customerId } = req.params;
        const validated = validateRequest(uploadDocumentSchema, req.body);

        logger.info('Uploading KYC document', {
            customerId,
            documentType: validated.document_type,
            userId: req.user?.id,
        });

        const { data, error } = await supabaseAdmin
            .from('customer_kyc_documents')
            .upsert({
                customer_id: customerId,
                document_type: validated.document_type,
                document_url: validated.document_url,
                file_name: validated.file_name,
                file_size: validated.file_size,
                file_type: validated.file_type,
                document_number: validated.document_number,
                uploaded_by: req.user!.id,
                status: 'PENDING',
            })
            .select()
            .single();

        if (error) throw error;

        const response: ApiResponse = {
            success: true,
            data,
        };

        res.json(response);
    })
);

// GET /api/v1/customers/:id/kyc/status - Get KYC status
router.get(
    '/:id/kyc/status',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id: customerId } = req.params;

        // Get all KYC documents
        const { data: documents, error } = await supabaseAdmin
            .from('customer_kyc_documents')
            .select('*')
            .eq('customer_id', customerId);

        if (error) throw error;

        // Calculate overall status
        const requiredDocs = ['PAN_CARD', 'GST_CERTIFICATE'];
        const approvedDocs = documents?.filter(d => d.status === 'APPROVED') || [];
        const approvedTypes = approvedDocs.map(d => d.document_type);
        const missingDocs = requiredDocs.filter(type => !approvedTypes.includes(type));

        let overallStatus: 'APPROVED' | 'PENDING' | 'NOT_STARTED';
        if (missingDocs.length === 0) {
            overallStatus = 'APPROVED';
        } else if (documents && documents.length > 0) {
            overallStatus = 'PENDING';
        } else {
            overallStatus = 'NOT_STARTED';
        }

        const response: ApiResponse = {
            success: true,
            data: {
                overallStatus,
                documents,
                approvedDocuments: approvedDocs,
                missingDocuments: missingDocs,
                requiredDocuments: requiredDocs,
            },
        };

        res.json(response);
    })
);

// PATCH /api/v1/customers/:customerId/kyc/verify/:documentId - Verify KYC document
router.patch(
    '/:customerId/kyc/verify/:documentId',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { customerId, documentId } = req.params;
        const validated = validateRequest(verifyDocumentSchema, req.body);

        logger.info('Verifying KYC document', {
            customerId,
            documentId,
            status: validated.status,
            userId: req.user?.id,
        });

        const { data, error } = await supabaseAdmin
            .from('customer_kyc_documents')
            .update({
                status: validated.status,
                verification_notes: validated.verification_notes,
                verified_by: req.user!.id,
                verified_at: new Date().toISOString(),
            })
            .eq('id', documentId)
            .eq('customer_id', customerId)
            .select()
            .single();

        if (error) throw error;

        // Update customer KYC status if all docs approved
        if (validated.status === 'APPROVED') {
            await updateCustomerKYCStatus(customerId);
        }

        const response: ApiResponse = {
            success: true,
            data,
        };

        res.json(response);
    })
);

// POST /api/v1/customers/bulk-upload - Bulk upload customers
router.post(
    '/bulk-upload',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const validated = validateRequest(bulkUploadSchema, req.body);

        logger.info('Bulk uploading customers', {
            count: validated.customers.length,
            userId: req.user?.id,
        });

        const results = {
            created: [] as any[],
            updated: [] as any[],
            errors: [] as any[],
        };

        for (const customerData of validated.customers) {
            try {
                // Check for existing customer by email or phone
                let existingCustomer = null;

                if (customerData.email) {
                    const { data } = await supabaseAdmin
                        .from('customers')
                        .select('*')
                        .eq('email', customerData.email)
                        .single();
                    existingCustomer = data;
                }

                if (!existingCustomer && customerData.phone) {
                    const { data } = await supabaseAdmin
                        .from('customers')
                        .select('*')
                        .eq('phone', customerData.phone)
                        .single();
                    existingCustomer = data;
                }

                if (existingCustomer) {
                    // Update existing
                    const { data, error } = await supabaseAdmin
                        .from('customers')
                        .update({
                            ...customerData,
                            tier: customerData.tier || 'STANDARD',
                        })
                        .eq('id', existingCustomer.id)
                        .select()
                        .single();

                    if (error) throw error;
                    results.updated.push(data);
                } else {
                    // Create new
                    const { data, error } = await supabaseAdmin
                        .from('customers')
                        .insert({
                            ...customerData,
                            tier: customerData.tier || 'STANDARD',
                            kyc_status: 'NOT_STARTED',
                            is_active: true,
                        })
                        .select()
                        .single();

                    if (error) throw error;
                    results.created.push(data);
                }
            } catch (error: any) {
                results.errors.push({
                    customer: customerData,
                    error: error.message,
                });
            }
        }

        const response: ApiResponse = {
            success: true,
            data: results,
        };

        res.json(response);
    })
);

// Helper function to update customer KYC status
async function updateCustomerKYCStatus(customerId: string) {
    const { data: documents } = await supabaseAdmin
        .from('customer_kyc_documents')
        .select('status')
        .eq('customer_id', customerId);

    const requiredDocs = ['PAN_CARD', 'GST_CERTIFICATE'];
    const approvedCount = documents?.filter(d => d.status === 'APPROVED').length || 0;

    let kycStatus: 'APPROVED' | 'PENDING' | 'NOT_STARTED';
    if (approvedCount >= requiredDocs.length) {
        kycStatus = 'APPROVED';
    } else if (documents && documents.length > 0) {
        kycStatus = 'PENDING';
    } else {
        kycStatus = 'NOT_STARTED';
    }

    await supabaseAdmin
        .from('customers')
        .update({ kyc_status: kycStatus })
        .eq('id', customerId);
}

export default router;
