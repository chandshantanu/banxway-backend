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

  // All 17 Banxway agent IDs by layer (updated 2026-03-18 — new IDs from AgentBuilder dashboard)
  agents: {
    // Layer 1 - Ingestion
    emailIngestion: process.env.AGENT_EMAIL_INGESTION_ID || '69a01b9f721c1cbd0fb1db1f',
    whatsappIngestion: process.env.AGENT_WHATSAPP_INGESTION_ID || '69a01bba945a26a766451b5a',
    phoneCallIngestion: process.env.AGENT_PHONE_INGESTION_ID || '69a01bbb721c1cbd0fb1db22',

    // Layer 2 - Processing
    communicationParser: process.env.AGENT_COMM_PARSER_ID || '69a01be126d6bf2351a089b1',
    normalization: process.env.AGENT_NORMALIZATION_ID || '69a01be226d6bf2351a089b4',
    nlpExtractor: process.env.AGENT_NLP_EXTRACTOR_ID || '69a01be3945a26a766451b5d',
    intentClassification: process.env.AGENT_INTENT_CLASS_ID || '69a01be4945a26a766451b60',
    dataValidator: process.env.AGENT_DATA_VALIDATOR_ID || '69a01be5721c1cbd0fb1db25',
    correlationEngine: process.env.AGENT_CORRELATION_ID || '69a01be626d6bf2351a089b7',

    // Layer 3 - Document
    pdfExtractor: process.env.AGENT_PDF_EXTRACTOR_ID || '69a01c2e26d6bf2351a089ba',
    excelExtractor: process.env.AGENT_EXCEL_EXTRACTOR_ID || '69a01c2f721c1cbd0fb1db28',
    wordExtractor: process.env.AGENT_WORD_EXTRACTOR_ID || '69a01c30721c1cbd0fb1db2b',

    // Layer 4 - Business
    shipmentRequest: process.env.AGENT_SHIPMENT_REQUEST_ID || '69a01c3126d6bf2351a089bd',
    rateQuote: process.env.AGENT_RATE_QUOTE_ID || '69a01c33945a26a766451b63',
    workflowOrchestration: process.env.AGENT_WORKFLOW_ORCH_ID || '69a01c3426d6bf2351a089c0',

    // Layer 5 - Validation
    humanValidation: process.env.AGENT_HUMAN_VALIDATION_ID || '69a01c35945a26a766451b66',
    clientValidation: process.env.AGENT_CLIENT_VALIDATION_ID || '69a01c36945a26a766451b69',
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
