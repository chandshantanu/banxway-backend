/**
 * Deploy all 17 Banxway AgentBuilder agents from draft → active
 *
 * Usage:
 *   npx ts-node src/scripts/deploy-agents.ts
 *   npx ts-node src/scripts/deploy-agents.ts --dry-run
 *
 * @created 2026-02-26
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { AGENTBUILDER_CONFIG, getAuthHeader } from '../services/agentbuilder/mcp-config';

const DRY_RUN = process.argv.includes('--dry-run');

// Agent names for readable output
const AGENT_NAMES: Record<string, string> = {
  emailIngestion: 'Email Ingestion (L1)',
  whatsappIngestion: 'WhatsApp Ingestion (L1)',
  phoneCallIngestion: 'Phone Call Ingestion (L1)',
  communicationParser: 'Communication Parser (L2)',
  normalization: 'Normalization (L2)',
  nlpExtractor: 'NLP Extractor (L2)',
  intentClassification: 'Intent Classification (L2)',
  dataValidator: 'Data Validator (L2)',
  correlationEngine: 'Correlation Engine (L2)',
  pdfExtractor: 'PDF Extractor (L3)',
  excelExtractor: 'Excel Extractor (L3)',
  wordExtractor: 'Word Extractor (L3)',
  shipmentRequest: 'Shipment Request (L4)',
  rateQuote: 'Rate Quote (L4)',
  workflowOrchestration: 'Workflow Orchestration (L4)',
  humanValidation: 'Human Validation (L5)',
  clientValidation: 'Client Validation (L5)',
};

interface AgentStatus {
  key: string;
  id: string;
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  error?: string;
}

async function fetchAgentStatus(agentId: string): Promise<{ status: string } | null> {
  const url = `${AGENTBUILDER_CONFIG.apiUrl}/api/v1/agents/${agentId}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<{ status: string }>;
}

async function deployAgent(agentId: string): Promise<void> {
  const url = `${AGENTBUILDER_CONFIG.apiUrl}/api/v1/agents/${agentId}/deploy`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify({ agent_id: agentId }),
  });

  if (!response.ok) {
    const body = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch {}
    const msg = parsed.error?.message || parsed.detail || body;
    throw new Error(`HTTP ${response.status}: ${msg}`);
  }
}

async function run(): Promise<void> {
  const token = AGENTBUILDER_CONFIG.authToken;

  if (!token) {
    console.error('❌ AGENTBUILDER_AUTH_TOKEN is not set. Cannot deploy agents.');
    process.exit(1);
  }

  console.log('🚀 Banxway Agent Deployment Script');
  console.log(`📡 API: ${AGENTBUILDER_CONFIG.apiUrl}`);
  console.log(`🔑 Auth: Bearer token (${token.substring(0, 20)}...)`);
  if (DRY_RUN) console.log('⚠️  DRY RUN MODE — no agents will be deployed');
  console.log('');

  const agents = AGENTBUILDER_CONFIG.agents;
  const results: AgentStatus[] = [];

  for (const [key, id] of Object.entries(agents)) {
    const name = AGENT_NAMES[key] || key;
    const result: AgentStatus = { key, id, name, status: 'pending' as const };

    process.stdout.write(`  ${name} (${id.substring(0, 8)}...)  `);

    if (DRY_RUN) {
      result.status = 'skipped';
      console.log('⏭  skipped (dry run)');
      results.push(result);
      continue;
    }

    try {
      // Check current status first — skip if already active
      const current = await fetchAgentStatus(id);
      if (current?.status === 'active') {
        result.status = 'skipped';
        console.log('✅ already active');
        results.push(result);
        continue;
      }

      await deployAgent(id);
      result.status = 'success';
      console.log('✅ deployed');
    } catch (error) {
      result.status = 'failed';
      result.error = (error as Error).message;
      console.log(`❌ FAILED: ${result.error}`);
    }

    results.push(result);

    // Small delay to avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  console.log(`✅ Deployed: ${succeeded}  ⏭  Skipped: ${skipped}  ❌ Failed: ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (failed > 0) {
    console.log('\nFailed agents:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  • ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
