// Freight Workflow Templates
// Auto-generated workflow definitions based on workflows.md

import {
    WorkflowDefinition,
    WorkflowNode,
    WorkflowEdge,
    WorkflowCategory,
    WorkflowTriggerType,
    WorkflowNodeType
} from '../types/workflow';

// ============================================================================
// WORKFLOW 1: SEA IMPORT - END-TO-END (12 Stages)
// ============================================================================

export const SEA_IMPORT_WORKFLOW: Partial<WorkflowDefinition> = {
    name: 'Sea Import - End-to-End',
    description: 'Complete sea import workflow from customer onboarding to job closure (12 stages)',
    category: WorkflowCategory.SHIPMENT_TRACKING,
    serviceTypes: ['SEA_FCL', 'SEA_LCL'],
    customerTiers: ['PREMIUM', 'STANDARD', 'BASIC'],
    version: 1,
    status: 'ACTIVE',

    nodes: [
        // Stage 1: Customer Onboarding
        {
            id: 'start',
            type: 'START',
            label: '1. Customer Onboarding',
            description: 'Trigger: Customer enquiry (email / website / sales / WhatsApp)',
            position: { x: 100, y: 100 },
            config: {
                type: 'START',
                trigger: 'MANUAL',
                triggerConfig: {
                    filters: { shipment_type: 'SEA_IMPORT' }
                }
            }
        },

        {
            id: 'check_kyc',
            type: 'CHECK_KYC_STATUS',
            label: 'Check KYC Status',
            position: { x: 100, y: 200 },
            config: {
                type: 'CHECK_KYC_STATUS',
                autoCreateCustomer: true,
                requireGST: true,
                requireIEC: true
            }
        },

        // Stage 2: Rate Enquiry & Quotation
        {
            id: 'rate_enquiry',
            type: 'CREATE_QUOTATION',
            label: '2. Rate Enquiry & Quotation',
            description: 'Ops pulls live rates, quotation auto-generated',
            position: { x: 100, y: 300 },
            config: {
                type: 'CREATE_QUOTATION',
                autoGenerateQuoteNumber: true,
                emailToCustomer: true,
                validityDays: 7,
                includeTermsAndConditions: true,
                template: 'sea_import_quotation'
            }
        },

        {
            id: 'send_quotation_email',
            type: 'SEND_EMAIL',
            label: 'Email Quotation',
            position: { x: 100, y: 400 },
            config: {
                type: 'SEND_EMAIL',
                to: '{{customer.email}}',
                subject: 'Sea Import Quotation - {{quotation.number}}',
                template: 'quotation_email',
                attachments: ['{{quotation.pdf}}']
            }
        },

        // Wait for quotation acceptance
        {
            id: 'await_quotation_acceptance',
            type: 'WAIT_FOR_EVENT',
            label: 'Await Quotation Acceptance',
            position: { x: 100, y: 500 },
            config: {
                type: 'WAIT_FOR_EVENT',
                event: 'QUOTATION_ACCEPTED',
                timeoutHours: 48
            }
        },

        // Stage 3: Job Confirmation
        {
            id: 'create_job',
            type: 'UPDATE_SHIPMENT',
            label: '3. Job Confirmation',
            description: 'Job opened, status = "Booking Confirmed", Ops assigned',
            position: { x: 100, y: 600 },
            config: {
                type: 'UPDATE_SHIPMENT',
                updateFields: {
                    current_stage: 'BOOKING',
                    status: 'ACTIVE',
                    quotation_id: '{{quotation.id}}'
                },
                autoAssignOps: true
            }
        },

        // Stage 4: Booking with Overseas Agent
        {
            id: 'booking_agent',
            type: 'SEND_EMAIL',
            label: '4. Booking with Overseas Agent',
            description: 'Booking sent to overseas agent',
            position: { x: 100, y: 700 },
            config: {
                type: 'SEND_EMAIL',
                to: '{{overseas_agent.email}}',
                subject: 'Booking Request - {{shipment.reference}}',
                template: 'booking_request',
                attachments: ['{{shipment.booking_details}}']
            }
        },

        // Stage 5: Pre-Alert & Document Management
        {
            id: 'validate_docs',
            type: 'VALIDATE_DOCUMENTS',
            label: '5. Pre-Alert & Document Management',
            description: 'Docs uploaded, system validates mandatory docs',
            position: { x: 100, y: 800 },
            config: {
                type: 'VALIDATE_DOCUMENTS',
                requiredDocuments: ['BL', 'INVOICE', 'PACKING_LIST'],
                optionalDocuments: ['COO', 'INSURANCE'],
                autoReminder: true,
                reminderAfterHours: 24,
                blockProgressIfMissing: false
            }
        },

        {
            id: 'docs_complete_check',
            type: 'CONDITION',
            label: 'All Docs Complete?',
            position: { x: 100, y: 900 },
            config: {
                type: 'CONDITION',
                conditions: [
                    { field: 'documents.complete', operator: 'equals', value: true }
                ],
                branches: {
                    true: 'arrival_tracking',
                    false: 'request_missing_docs'
                }
            }
        },

        {
            id: 'request_missing_docs',
            type: 'SEND_EMAIL',
            label: 'Request Missing Documents',
            position: { x: 300, y: 900 },
            config: {
                type: 'SEND_EMAIL',
                to: '{{customer.email}}',
                subject: 'Missing Documents - {{shipment.reference}}',
                template: 'missing_documents',
                variables: { missingDocs: '{{documents.missing}}' }
            }
        },

        // Stage 6: Arrival & IGM/DO Handling
        {
            id: 'arrival_tracking',
            type: 'UPDATE_SHIPMENT',
            label: '6. Arrival & IGM/DO Handling',
            description: 'ETA auto-updated, arrival notice sent',
            position: { x: 100, y: 1000 },
            config: {
                type: 'UPDATE_SHIPMENT',
                updateFields: {
                    current_stage: 'PORT_ARRIVAL',
                    arrival_date: '{{vessel.eta}}'
                }
            }
        },

        {
            id: 'send_arrival_notice',
            type: 'SEND_WHATSAPP',
            label: 'Send Arrival Notice (WhatsApp)',
            position: { x: 100, y: 1100 },
            config: {
                type: 'SEND_WHATSAPP',
                from: '{{exotel.whatsapp_number}}',
                to: '{{customer.phone}}',
                messageType: 'text',
                content: {
                    text: 'Your shipment {{shipment.reference}} has arrived at {{port.name}}. DO charges: {{do.charges}}'
                }
            }
        },

        // Stage 7: Customs Clearance (Optional)
        {
            id: 'customs_check',
            type: 'CONDITION',
            label: 'Customs Required?',
            position: { x: 100, y: 1200 },
            config: {
                type: 'CONDITION',
                conditions: [
                    { field: 'service_scope', operator: 'contains', value: 'customs' }
                ],
                branches: {
                    true: 'file_customs',
                    false: 'delivery'
                }
            }
        },

        {
            id: 'file_customs',
            type: 'FILE_CUSTOMS',
            label: '7. Customs Clearance',
            description: 'BOE filed, duty calculated, OOC uploaded',
            position: { x: 300, y: 1300 },
            config: {
                type: 'FILE_CUSTOMS',
                assignCHA: true,
                trackDuty: true,
                autoNotifyOnOOC: true
            }
        },

        // Stage 8: Delivery
        {
            id: 'delivery',
            type: 'ASSIGN_TRANSPORTER',
            label: '8. Delivery / CFS Movement',
            description: 'Transport arranged, cargo delivered, POD uploaded',
            position: { x: 100, y: 1400 },
            config: {
                type: 'ASSIGN_TRANSPORTER',
                notifyCustomer: true,
                collectPOD: true,
                trackGPS: false
            }
        },

        // Stage 9: Costing & Expense Posting
        {
            id: 'cost_capture',
            type: 'FOR_EACH',
            label: '9. Costing & Expense Posting',
            description: 'Vendor bills uploaded, costs approved',
            position: { x: 100, y: 1500 },
            config: {
                type: 'FOR_EACH',
                iterateOver: 'vendor_invoices',
                itemVariable: 'invoice',
                loopBody: {
                    nodes: [
                        {
                            id: 'process_invoice',
                            type: 'CREATE_TASK',
                            label: 'Process Vendor Invoice',
                            position: { x: 0, y: 0 },
                            config: {
                                type: 'CREATE_TASK',
                                title: 'Approve Invoice: {{invoice.number}}',
                                description: 'Review and approve vendor invoice',
                                assignTo: '{{ops.manager_id}}',
                                priority: 'MEDIUM',
                                dueInMinutes: 1440,
                                taskType: 'INVOICE_APPROVAL'
                            }
                        }
                    ],
                    edges: []
                },
                maxIterations: 50
            }
        },

        // Stage 10: Customer Billing
        {
            id: 'create_invoice',
            type: 'CREATE_INVOICE',
            label: '10. Customer Billing',
            description: 'Invoice auto-generated, GST applied, emailed',
            position: { x: 100, y: 1600 },
            config: {
                type: 'CREATE_INVOICE',
                autoGenerateInvoiceNumber: true,
                applyGST: true,
                gstRate: 18,
                creditDays: 30,
                emailToCustomer: true,
                sendReminder: true,
                reminderAfterDays: 25
            }
        },

        // Stage 11: Collection & Closure
        {
            id: 'await_payment',
            type: 'WAIT_FOR_EVENT',
            label: '11. Await Payment',
            description: 'Waiting for payment receipt',
            position: { x: 100, y: 1700 },
            config: {
                type: 'WAIT_FOR_EVENT',
                event: 'PAYMENT_RECEIVED',
                timeoutDays: 30
            }
        },

        {
            id: 'close_job',
            type: 'UPDATE_SHIPMENT',
            label: 'Close Job',
            position: { x: 100, y: 1800 },
            config: {
                type: 'UPDATE_SHIPMENT',
                updateFields: {
                    current_stage: 'CLOSURE',
                    status: 'COMPLETED',
                    closed_at: '{{now}}'
                }
            }
        },

        // CRM Sync
        {
            id: 'sync_crm',
            type: 'UPDATE_CRM',
            label: 'Sync to CRM',
            position: { x: 100, y: 1900 },
            config: {
                type: 'UPDATE_CRM',
                crmSystem: 'ESPOCRM',
                operation: 'UPDATE',
                entityType: 'ACCOUNT',
                fieldMapping: {
                    'shipment.total_revenue': 'total_revenue',
                    'shipment.status': 'last_shipment_status',
                    'customer.id': 'account_id'
                },
                syncDirection: 'TO_CRM'
            }
        },

        // End
        {
            id: 'end',
            type: 'END',
            label: 'Workflow Complete',
            position: { x: 100, y: 2000 },
            config: {
                type: 'END',
                outcome: 'SUCCESS',
                finalActions: {
                    sendNotification: true,
                    updateStatus: 'ARCHIVED'
                }
            }
        }
    ] as WorkflowNode[],

    edges: [
        { id: 'e1', source: 'start', target: 'check_kyc', label: 'Customer enquiry received' },
        { id: 'e2', source: 'check_kyc', target: 'rate_enquiry', label: 'KYC approved' },
        { id: 'e3', source: 'rate_enquiry', target: 'send_quotation_email' },
        { id: 'e4', source: 'send_quotation_email', target: 'await_quotation_acceptance' },
        { id: 'e5', source: 'await_quotation_acceptance', target: 'create_job', label: 'Quotation accepted' },
        { id: 'e6', source: 'create_job', target: 'booking_agent' },
        { id: 'e7', source: 'booking_agent', target: 'validate_docs' },
        { id: 'e8', source: 'validate_docs', target: 'docs_complete_check' },
        { id: 'e9', source: 'docs_complete_check', target: 'arrival_tracking', label: 'All docs complete' },
        { id: 'e10', source: 'docs_complete_check', target: 'request_missing_docs', label: 'Docs missing' },
        { id: 'e11', source: 'request_missing_docs', target: 'validate_docs', label: 'Loop back for recheck' },
        { id: 'e12', source: 'arrival_tracking', target: 'send_arrival_notice' },
        { id: 'e13', source: 'send_arrival_notice', target: 'customs_check' },
        { id: 'e14', source: 'customs_check', target: 'file_customs', label: 'Customs required' },
        { id: 'e15', source: 'customs_check', target: 'delivery', label: 'No customs' },
        { id: 'e16', source: 'file_customs', target: 'delivery', label: 'Clearance complete' },
        { id: 'e17', source: 'delivery', target: 'cost_capture' },
        { id: 'e18', source: 'cost_capture', target: 'create_invoice' },
        { id: 'e19', source: 'create_invoice', target: 'await_payment' },
        { id: 'e20', source: 'await_payment', target: 'close_job', label: 'Payment received' },
        { id: 'e21', source: 'close_job', target: 'sync_crm' },
        { id: 'e22', source: 'sync_crm', target: 'end' }
    ] as WorkflowEdge[],


    triggers: [
        { type: WorkflowTriggerType.MANUAL, config: {} },
        { type: WorkflowTriggerType.QUOTATION_ACCEPTED, config: { autoStart: true } }
    ],

    slaConfig: {
        responseTimeMinutes: 240, // 4 hours
        resolutionTimeMinutes: 20160, // 14 days
        escalationRules: [
            {
                afterMinutes: 192, // 80% of response time
                escalateTo: ['ops_manager'],
                notifyVia: ['email', 'whatsapp']
            },
            {
                afterMinutes: 240, // 100% of response time
                escalateTo: ['ops_director'],
                notifyVia: ['email', 'whatsapp', 'call']
            }
        ]
    },

    tags: ['sea', 'import', 'fcl', 'lcl', 'india']
};

// Export all 9 workflows
export const FREIGHT_WORKFLOW_TEMPLATES = [
    SEA_IMPORT_WORKFLOW,
    // AIR_IMPORT_WORKFLOW,      // To be created
    // AIR_EXPORT_WORKFLOW,       // To be created
    // ODC_EXPORT_WORKFLOW,       // To be created
    // ODC_IMPORT_WORKFLOW,       // To be created
    // BREAK_BULK_EXPORT_WORKFLOW,// To be created
    // BREAK_BULK_IMPORT_WORKFLOW,// To be created
    // SEA_THIRD_COUNTRY_WORKFLOW,// To be created
    // AIR_THIRD_COUNTRY_WORKFLOW // To be created
];
