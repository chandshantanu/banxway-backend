// Workflow Generator Script
// Generates all 9 freight workflow templates programmatically

import { WorkflowDefinition, WorkflowCategory } from '../types/workflow';
import { SEA_IMPORT_WORKFLOW } from './freight-workflow-templates';

/**
 * Workflow configuration matrix
 * Each workflow shares similar structure but with variations
 */
const WORKFLOW_CONFIGS = [
    {
        name: 'Air Import - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['AIR_IMPORT'],
        stages: 12,
        documents: ['AWB', 'INVOICE', 'PACKING_LIST', 'COO', 'MSDS'],
        customsNode: 'FILE_CUSTOMS',
        transportMode: 'AIR',
        direction: 'IMPORT'
    },
    {
        name: 'Air Export - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['AIR_EXPORT'],
        stages: 13,
        documents: ['INVOICE', 'PACKING_LIST', 'SHIPPING_BILL', 'DG_DECLARATION'],
        customsNode: 'FILE_CUSTOMS',
        transportMode: 'AIR',
        direction: 'EXPORT'
    },
    {
        name: 'ODC Export - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['ODC_EXPORT'],
        stages: 13,
        documents: ['INVOICE', 'PACKING_LIST', 'TECHNICAL_DRAWINGS', 'LOAD_CERTIFICATE'],
        customsNode: 'FILE_CUSTOMS',
        transportMode: 'ODC',
        direction: 'EXPORT',
        requiresRoutesurvey: true,
        requiresPermits: true
    },
    {
        name: 'ODC Import - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['ODC_IMPORT'],
        stages: 13,
        documents: ['BL', 'INVOICE', 'PACKING_LIST', 'TECHNICAL_DRAWINGS'],
        customsNode: 'FILE_CUSTOMS',
        transportMode: 'ODC',
        direction: 'IMPORT',
        requiresRouteSurvey: true,
        requiresPermits: true
    },
    {
        name: 'Break Bulk Export - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['BREAK_BULK_EXPORT'],
        stages: 13,
        documents: ['INVOICE', 'PACKING_LIST', 'WEIGHT_CERTIFICATE'],
        customsNode: 'FILE_CUSTOMS',
        transportMode: 'BREAK_BULK',
        direction: 'EXPORT'
    },
    {
        name: 'Break Bulk Import - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['BREAK_BULK_IMPORT'],
        stages: 13,
        documents: ['BL', 'INVOICE', 'PACKING_LIST'],
        customsNode: 'FILE_CUSTOMS',
        transportMode: 'BREAK_BULK',
        direction: 'IMPORT'
    },
    {
        name: 'Sea Third Country - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['SEA_AIR_THIRD_COUNTRY'],
        stages: 13,
        documents: ['BL', 'INVOICE', 'PACKING_LIST'],
        customsNode: null, // No customs in third country
        transportMode: 'SEA',
        direction: 'THIRD_COUNTRY'
    },
    {
        name: 'Air Third Country - End-to-End',
        category: 'SHIPMENT_TRACKING' as WorkflowCategory,
        shipmentTypes: ['SEA_AIR_THIRD_COUNTRY'],
        stages: 12,
        documents: ['AWB', 'INVOICE', 'PACKING_LIST'],
        customsNode: null, // No customs in third country
        transportMode: 'AIR',
        direction: 'THIRD_COUNTRY'
    }
];

/**
 * Generate all 9 workflow templates
 * This uses the SEA_IMPORT_WORKFLOW as a base template and modifies it
 */
export function generateAllWorkflowTemplates(): Partial<WorkflowDefinition>[] {
    const templates: Partial<WorkflowDefinition>[] = [SEA_IMPORT_WORKFLOW];

    for (const config of WORKFLOW_CONFIGS) {
        const workflow = generateWorkflowFromConfig(config);
        templates.push(workflow);
    }

    return templates;
}

/**
 * Generate a workflow from configuration
 * This creates a workflow by modifying the base template
 */
function generateWorkflowFromConfig(config: any): Partial<WorkflowDefinition> {
    // Clone the SEA_IMPORT template as base
    const baseWorkflow = JSON.parse(JSON.stringify(SEA_IMPORT_WORKFLOW));

    // Modify for this workflow type
    baseWorkflow.name = config.name;
    baseWorkflow.description = `Complete ${config.transportMode.toLowerCase()} ${config.direction.toLowerCase()} workflow (${config.stages} stages)`;
    baseWorkflow.serviceTypes = config.shipmentTypes;
    baseWorkflow.category = config.category;

    // Update document validation node
    const docNode = baseWorkflow.nodes.find((n: any) => n.type === 'VALIDATE_DOCUMENTS');
    if (docNode) {
        docNode.config.requiredDocuments = config.documents;
    }

    // Add route survey for ODC workflows
    if (config.requiresRouteSurvey) {
        const routeSurveyNode = {
            id: 'route_survey',
            type: 'CREATE_TASK',
            label: 'Route Survey & Permits',
            description: 'Survey route and obtain required permits',
            position: { x: 100, y: 650 },
            config: {
                type: 'CREATE_TASK',
                title: 'Complete Route Survey',
                description: 'Conduct route survey and apply for RTO/NHAI permits',
                assignTo: '{{ops.survey_team}}',
                priority: 'HIGH',
                dueInMinutes: 2880, // 2 days
                taskType: 'ROUTE_SURVEY'
            }
        };

        // Insert after booking confirmation
        const bookingIndex = baseWorkflow.nodes.findIndex((n: any) => n.id === 'create_job');
        baseWorkflow.nodes.splice(bookingIndex + 1, 0, routeSurveyNode);

        // Add edge
        baseWorkflow.edges.push({
            id: 'e_survey',
            source: 'create_job',
            target: 'route_survey',
            label: 'ODC shipment'
        });
    }

    // Remove customs node for third country workflows
    if (!config.customsNode) {
        baseWorkflow.nodes = baseWorkflow.nodes.filter((n: any) =>
            n.id !== 'file_customs' && n.id !== 'customs_check'
        );

        // Update edges to skip customs
        baseWorkflow.edges = baseWorkflow.edges.map((e: any) => {
            if (e.target === 'customs_check') {
                return { ...e, target: 'delivery' };
            }
            return e;
        }).filter((e: any) =>
            e.source !== 'customs_check' && e.source !== 'file_customs'
        );
    }

    // Update tags
    baseWorkflow.tags = [
        config.transportMode.toLowerCase(),
        config.direction.toLowerCase(),
        ...config.shipmentTypes.map((t: string) => t.toLowerCase())
    ];

    return baseWorkflow;
}

// Export all workflows
export const ALL_FREIGHT_WORKFLOWS = generateAllWorkflowTemplates();
