// Workflow Integration Node Configuration Types
// Phase 1: Manual Data Entry, CRM, KYC, AI Nodes

import { WorkflowNodeType } from './workflow';

// ============================================================================
// MANUAL DATA ENTRY NODE
// ============================================================================

export interface ManualDataEntryNodeConfig {
    type: typeof WorkflowNodeType.MANUAL_DATA_ENTRY;

    // Form specification
    formSchema: {
        fields: Array<{
            name: string;
            type: 'text' | 'number' | 'email' | 'phone' | 'date' | 'select' | 'textarea' | 'checkbox';
            label: string;
            placeholder?: string;
            required?: boolean;
            defaultValue?: any;
            validation?: {
                min?: number;
                max?: number;
                pattern?: string;
                minLength?: number;
                maxLength?: number;
                options?: string[];  // For select fields
            };
        }>;
    };

    // UI configuration
    formTitle?: string;
    formDescription?: string;
    submitButtonText?: string;

    // Assignment
    assignTo?: string;  // User ID or role (e.g., 'role:agent', 'role:manager')
    allowEdit?: boolean;  // Can edit after submission

    // Data handling
    saveToContext?: boolean;  // Save to workflow context
    contextKey?: string;  // Key name in context
    required?: boolean;  // Block workflow if not completed

    // Timeout
    timeoutMinutes?: number;
    onTimeout?: 'SKIP' | 'ESCALATE' | 'FAIL';
}

// ============================================================================
// CRM LOOKUP NODE
// ============================================================================

export interface CRMLookupNodeConfig {
    type: typeof WorkflowNodeType.CRM_LOOKUP;

    // Lookup criteria
    lookupBy: 'email' | 'phone' | 'pan' | 'gstin' | 'customer_id';
    lookupValue: string;  // Can use template: '{{context.customer_email}}'

    // Behavior
    createIfNotFound?: boolean;
    requiredFields?: string[];  // Fields required for creation

    // Data handling
    saveToContext: boolean;
    contextKey: string;  // e.g., 'customer'

    // Fields to fetch
    fetchFields?: string[];  // Specific fields to retrieve

    // Error handling
    onNotFound?: 'FAIL' | 'CONTINUE' | 'CREATE';
    onError?: 'FAIL' | 'CONTINUE' | 'RETRY';
    retryCount?: number;
}

// ============================================================================
// CRM UPDATE NODE
// ============================================================================

export interface CRMUpdateNodeConfig {
    type: typeof WorkflowNodeType.CRM_UPDATE;

    // Target customer
    customerId: string;  // Template: '{{context.customer.id}}'

    // Updates to apply
    updates: Record<string, any>;  // Key-value pairs to update

    // Options
    validateBeforeUpdate?: boolean;
    mergeStrategy?: 'REPLACE' | 'MERGE';  // How to handle existing data

    // Audit
    trackChanges?: boolean;
    changeReason?: string;

    // Error handling
    onError?: 'FAIL' | 'CONTINUE' | 'RETRY';
    retryCount?: number;
}

// ============================================================================
// KYC VERIFICATION NODE
// ============================================================================

export interface KYCVerificationNodeConfig {
    type: typeof WorkflowNodeType.KYC_VERIFICATION;

    // Target customer
    customerId: string;  // Template: '{{context.customer.id}}'

    // Required documents
    requiredDocuments: Array<'PAN_CARD' | 'GST_CERTIFICATE' | 'COMPANY_REGISTRATION' | 'ADDRESS_PROOF'>;

    // Verification behavior
    autoApprove?: boolean;  // Auto-approve if all docs present
    expiryCheck?: boolean;  // Check document expiry dates
    ocrEnabled?: boolean;  // Enable OCR data extraction

    // Workflow control
    blockIfIncomplete?: boolean;  // Block workflow if KYC incomplete
    sendReminder?: boolean;  // Send reminder if documents missing
    reminderAfterMinutes?: number;

    // Data handling
    saveStatus?: boolean;
    contextKey?: string;  // Where to save KYC status

    // Escalation
    escalateAfterDays?: number;  // Escalate if not completed
    escalateTo?: string;  // User or role
}

// ============================================================================
// DOCUMENT UPLOAD NODE
// ============================================================================

export interface DocumentUploadNodeConfig {
    type: typeof WorkflowNodeType.DOCUMENT_UPLOAD;

    // Document specification
    documentType: 'KYC_DOCUMENT' | 'INVOICE' | 'BOL' | 'PACKING_LIST' | 'CERTIFICATE' | 'OTHER';
    title?: string;
    description?: string;

    // Upload constraints
    allowedFormats?: string[];  // ['pdf', 'jpg', 'png']
    maxSizeMB?: number;
    required?: boolean;
    multipleFiles?: boolean;

    // AI/OCR processing
    ocrEnabled?: boolean;
    extractionSchema?: Record<string, string>;  // Fields to extract

    // Data handling
    linkToEntity?: 'customer' | 'shipment' | 'quotation';
    entityId?: string;  // Template: '{{context.shipment.id}}'
    saveToContext?: boolean;
    contextKey?: string;

    // Assignment
    assignTo?: string;  // Who should upload
    timeoutMinutes?: number;
}

// ============================================================================
// AI GENERATE EMAIL NODE
// ============================================================================

export interface AIGenerateEmailNodeConfig {
    type: typeof WorkflowNodeType.AI_GENERATE_EMAIL;

    // Email purpose
    purpose: 'RFQ_TO_VENDOR' | 'CLARIFICATION_TO_CUSTOMER' | 'QUOTATION' | 'FOLLOW_UP' | 'REMINDER' | 'CUSTOM';

    // Context for generation
    context: Record<string, any>;  // Data to use for generation
    includeThreadHistory?: boolean;

    // Template/Style
    template?: 'professional' | 'formal' | 'friendly' | 'urgent';
    tone?: 'neutral' | 'apologetic' | 'assertive';
    maxWords?: number;

    // Recipients
    toEmail?: string | string[];  // Can use templates
    ccEmail?: string | string[];
    bccEmail?: string | string[];

    // Attachments
    includeAttachments?: boolean;
    attachmentPaths?: string[];

    // Approval workflow
    requireApproval: boolean;
    approvalBy?: string;  // User or role
    saveDraft?: boolean;
    autoSend?: boolean;  // Only if approved

    // Guard rails
    guardrails: {
        maxWords?: number;
        toxicityFilter?: boolean;
        factCheck?: boolean;
        requiredFields?: string[];  // Must include these sections
        blockFinancialData?: boolean;
    };

    // Data handling
    saveToContext?: boolean;
    contextKey?: string;
}

// ============================================================================
// AI SUGGEST NEXT STEP NODE
// ============================================================================

export interface AISuggestNextStepNodeConfig {
    type: typeof WorkflowNodeType.AI_SUGGEST_NEXT_STEP;

    // Analysis context
    analyzeCurrent: {
        shipmentStage?: string;
        lastCommunication?: string;
        pendingDocuments?: string[];
        customerTier?: string;
        customData?: Record<string, any>;
    };

    // Possible actions to suggest
    suggestActions: Array<
        'SEND_REMINDER_EMAIL' |
        'ESCALATE_TO_MANAGER' |
        'REQUEST_DOCUMENTS' |
        'UPDATE_CUSTOMER' |
        'SEND_QUOTATION' |
        'SCHEDULE_CALL' |
        'CREATE_TASK'
    >;

    // Behavior
    confidenceThreshold?: number;  // Min confidence to show (0.0-1.0)
    maxSuggestions?: number;
    presentToUser: boolean;  // Show in UI for review
    allowOverride?: boolean;  // User can override

    // Guard rails
    guardrails: {
        noFinancial?: boolean;  // Don't suggest financial actions
        requireApprovalFor?: string[];  // Always need approval for these
        maxAutomationLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    };

    // Approval
    autoExecute?: boolean;  // Auto-execute if confidence > threshold
    requireApprovalAbove?: number;  // Require approval if confidence above this

    // Data handling
    saveToContext?: boolean;
    contextKey?: string;
}

// ============================================================================
// SCHEMA VALIDATION NODE
// ============================================================================

export interface SchemaValidationNodeConfig {
    type: typeof WorkflowNodeType.SCHEMA_VALIDATION;

    // JSON Schema specification
    schema: {
        type: 'object';
        required?: string[];
        properties: Record<string, any>;  // JSON Schema property definitions
    };

    // Data source
    dataSource: string;  // Template: '{{context.formData}}'

    // Validation behavior
    strictValidation?: boolean;  // Fail on any validation error
    allowAdditionalProperties?: boolean;
    coerceTypes?: boolean;  // Try to convert types

    // Error handling
    onValidationFail: 'RETRY' | 'ESCALATE' | 'SKIP' | 'FAIL';
    errorMessage?: string;
    maxRetries?: number;

    // User feedback
    showErrors?: boolean;  // Display validation errors to user
    highlightFields?: boolean;  // Highlight invalid fields

    // Data handling
    saveValidData?: boolean;
    contextKey?: string;
}

// ============================================================================
// UNION TYPE FOR ALL NODE CONFIGS
// ============================================================================

export type IntegrationNodeConfig =
    | ManualDataEntryNodeConfig
    | CRMLookupNodeConfig
    | CRMUpdateNodeConfig
    | KYCVerificationNodeConfig
    | DocumentUploadNodeConfig
    | AIGenerateEmailNodeConfig
    | AISuggestNextStepNodeConfig
    | SchemaValidationNodeConfig;

// Export all types
export type {
    ManualDataEntryNodeConfig,
    CRMLookupNodeConfig,
    CRMUpdateNodeConfig,
    KYCVerificationNodeConfig,
    DocumentUploadNodeConfig,
    AIGenerateEmailNodeConfig,
    AISuggestNextStepNodeConfig,
    SchemaValidationNodeConfig,
};
