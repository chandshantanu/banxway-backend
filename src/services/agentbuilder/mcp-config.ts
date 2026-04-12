/**
 * AgentBuilder MCP Configuration
 * Connection settings for AgentBuilder production instance
 * All 17 Banxway agents across 5 layers
 *
 * @created 2026-02-05
 * @updated 2026-03-23
 */

import { logger } from '../../utils/logger';

// Token auto-refresh state
let _cachedToken = process.env.AGENTBUILDER_AUTH_TOKEN || '';
let _tokenExpiresAt = 0;

export const AGENTBUILDER_CONFIG = {
  connectionId: process.env.AGENTBUILDER_CONNECTION_ID || '',
  apiUrl: process.env.AGENTBUILDER_API_URL || 'https://agentsapi.chatslytics.com',
  get authToken() { return _cachedToken; },

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

/** Refresh the AgentBuilder auth token using Chatslytics GoTrue credentials.
 *  Auth migrated from Supabase Cloud → self-hosted GoTrue on 2026-04-08.
 *  GoTrue is exposed at agentsapi.chatslytics.com/auth/v1 (same domain as API).
 */
async function refreshToken(): Promise<string> {
  // GoTrue is self-hosted at agentsapi.chatslytics.com — NOT the old Supabase Cloud URL
  const supabaseUrl = process.env.CHATSLYTICS_GOTRUE_URL || process.env.CHATSLYTICS_SUPABASE_URL || 'https://agentsapi.chatslytics.com';
  const anonKey = process.env.CHATSLYTICS_SUPABASE_ANON_KEY || '';
  const email = process.env.CHATSLYTICS_AUTH_EMAIL || '';
  const password = process.env.CHATSLYTICS_AUTH_PASSWORD || '';

  if (!anonKey || !email || !password) {
    logger.debug('Chatslytics credentials not configured, using static token');
    return _cachedToken;
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json() as Record<string, any>;
    if (data.access_token) {
      _cachedToken = data.access_token as string;
      _tokenExpiresAt = Date.now() + (data.expires_in ? Number(data.expires_in) * 1000 - 60000 : 3000000);
      logger.info('AgentBuilder auth token refreshed', { expiresIn: data.expires_in });
      return _cachedToken;
    }
    logger.error('Failed to refresh AgentBuilder token', { error: data.error || data.msg });
  } catch (err: any) {
    logger.error('Token refresh failed', { error: err.message });
  }
  return _cachedToken;
}

/** Get auth header for AgentBuilder API calls — auto-refreshes if expired */
export async function getAuthHeaderAsync(): Promise<Record<string, string>> {
  if (AGENTBUILDER_CONFIG.connectionId) {
    return { 'X-MCP-Connection-ID': AGENTBUILDER_CONFIG.connectionId };
  }
  // Refresh if token is about to expire
  if (_tokenExpiresAt > 0 && Date.now() > _tokenExpiresAt) {
    await refreshToken();
  }
  if (_cachedToken) {
    return { 'Authorization': `Bearer ${_cachedToken}` };
  }
  return {};
}

/** Sync version for backward compatibility — uses cached token */
export function getAuthHeader(): Record<string, string> {
  if (AGENTBUILDER_CONFIG.connectionId) {
    return { 'X-MCP-Connection-ID': AGENTBUILDER_CONFIG.connectionId };
  }
  if (_cachedToken) {
    return { 'Authorization': `Bearer ${_cachedToken}` };
  }
  return {};
}

// Auto-refresh token on startup and every 50 minutes
if (process.env.CHATSLYTICS_AUTH_EMAIL && process.env.CHATSLYTICS_AUTH_PASSWORD) {
  setTimeout(() => refreshToken(), 5000); // 5s after startup
  setInterval(() => refreshToken(), 50 * 60 * 1000); // every 50 min
}
