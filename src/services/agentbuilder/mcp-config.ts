/**
 * AgentBuilder MCP Configuration
 * Connection settings for AgentBuilder production instance
 * All 17 Banxway agents across 5 layers
 *
 * @created 2026-02-05
 * @updated 2026-02-15
 */

export const AGENTBUILDER_CONFIG = {
  connectionId: process.env.AGENTBUILDER_CONNECTION_ID || '',
  apiUrl: process.env.AGENTBUILDER_API_URL || 'https://agentsapi.chatslytics.com',
  authToken: process.env.AGENTBUILDER_AUTH_TOKEN || '',

  timeout: {
    execution: 30000,
    webhook: 5000,
  },

  // All 17 Banxway agent IDs by layer
  agents: {
    // Layer 1 - Ingestion
    emailIngestion: process.env.AGENT_EMAIL_INGESTION_ID || '69850513342845bd9f959a52',
    whatsappIngestion: process.env.AGENT_WHATSAPP_INGESTION_ID || '698505168442f48a5ac0b0a1',
    phoneCallIngestion: process.env.AGENT_PHONE_INGESTION_ID || '69850519342845bd9f959a55',

    // Layer 2 - Processing
    communicationParser: process.env.AGENT_COMM_PARSER_ID || '69850308342845bd9f959a48',
    normalization: process.env.AGENT_NORMALIZATION_ID || '69850521342845bd9f959a58',
    nlpExtractor: process.env.AGENT_NLP_EXTRACTOR_ID || '69850526093676026417ff83',
    intentClassification: process.env.AGENT_INTENT_CLASS_ID || '6985052a093676026417ff86',
    dataValidator: process.env.AGENT_DATA_VALIDATOR_ID || '698503358442f48a5ac0b099',
    correlationEngine: process.env.AGENT_CORRELATION_ID || '6985052d8442f48a5ac0b0a4',

    // Layer 3 - Document
    pdfExtractor: process.env.AGENT_PDF_EXTRACTOR_ID || '69850738093676026417ff92',
    excelExtractor: process.env.AGENT_EXCEL_EXTRACTOR_ID || '698507428442f48a5ac0b0b2',
    wordExtractor: process.env.AGENT_WORD_EXTRACTOR_ID || '69850746342845bd9f959a67',

    // Layer 4 - Business
    shipmentRequest: process.env.AGENT_SHIPMENT_REQUEST_ID || '69850760342845bd9f959a6a',
    rateQuote: process.env.AGENT_RATE_QUOTE_ID || '69850765342845bd9f959a6d',
    workflowOrchestration: process.env.AGENT_WORKFLOW_ORCH_ID || '698507698442f48a5ac0b0b5',

    // Layer 5 - Validation
    humanValidation: process.env.AGENT_HUMAN_VALIDATION_ID || '6985076d8442f48a5ac0b0b8',
    clientValidation: process.env.AGENT_CLIENT_VALIDATION_ID || '69850771342845bd9f959a70',
  },
};

/** Agent layer mapping for grouping (keys match frontend AgentLayer type) */
export const AGENT_LAYERS: Record<string, { name: string; agents: string[] }> = {
  INGESTION: {
    name: 'Ingestion',
    agents: ['emailIngestion', 'whatsappIngestion', 'phoneCallIngestion'],
  },
  PROCESSING: {
    name: 'Processing',
    agents: ['communicationParser', 'normalization', 'nlpExtractor', 'intentClassification', 'dataValidator', 'correlationEngine'],
  },
  DOCUMENTS: {
    name: 'Documents',
    agents: ['pdfExtractor', 'excelExtractor', 'wordExtractor'],
  },
  BUSINESS: {
    name: 'Business',
    agents: ['shipmentRequest', 'rateQuote', 'workflowOrchestration'],
  },
  VALIDATION: {
    name: 'Validation',
    agents: ['humanValidation', 'clientValidation'],
  },
};

export function validateMcpConfig(): void {
  if (!AGENTBUILDER_CONFIG.apiUrl) {
    throw new Error('AGENTBUILDER_API_URL environment variable is required');
  }
}

export function isMcpEnabled(): boolean {
  return !!(AGENTBUILDER_CONFIG.connectionId || AGENTBUILDER_CONFIG.authToken);
}

/** Get auth header for AgentBuilder API calls */
export function getAuthHeader(): Record<string, string> {
  if (AGENTBUILDER_CONFIG.connectionId) {
    return { 'X-MCP-Connection-ID': AGENTBUILDER_CONFIG.connectionId };
  }
  if (AGENTBUILDER_CONFIG.authToken) {
    return { 'Authorization': `Bearer ${AGENTBUILDER_CONFIG.authToken}` };
  }
  return {};
}
