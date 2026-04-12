#!/usr/bin/env ts-node
/**
 * Agent LLM Graph Validation Script
 *
 * Tests critical agents with realistic freight email data to verify they
 * return expected outputs against the live AgentBuilder API.
 *
 * Run: npm run agents:validate
 *      npx ts-node scripts/validate-agents.ts
 *
 * NOTE: Do NOT run this in CI — it calls live agents on production.
 */

import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars before any other imports
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { AGENTBUILDER_CONFIG, getAuthHeaderAsync } from '../src/services/agentbuilder/mcp-config';

const BACKEND_URL =
  process.env.BACKEND_URL ||
  'https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io';

// ---------------------------------------------------------------------------
// Test payload definitions
// ---------------------------------------------------------------------------

interface TestCase {
  agentKey: keyof typeof AGENTBUILDER_CONFIG.agents;
  input: Record<string, unknown>;
  /** Top-level keys expected in the agent response output */
  expectedFields: string[];
}

const TEST_CASES: Record<string, TestCase> = {
  'Email Ingestion': {
    agentKey: 'emailIngestion',
    input: {
      channel: 'EMAIL',
      from: 'buyer@testcorp.com',
      to: 'quotes@banxwayglobal.com',
      subject: 'RFQ: FCL Shanghai to Rotterdam - 20 tons electronics',
      content:
        'Dear team,\n\nPlease provide a rate quote for the following:\n\n' +
        '- Origin: Shanghai, China\n' +
        '- Destination: Rotterdam, Netherlands\n' +
        '- Commodity: Consumer electronics\n' +
        '- Weight: 20 metric tons\n' +
        '- Container: 40ft standard\n' +
        '- Incoterm: FOB Shanghai\n' +
        '- Required shipping date: May 15, 2026\n\n' +
        'Please include all-in rates.\n\nBest regards,\nJohn from TestCorp',
      timestamp: new Date().toISOString(),
    },
    expectedFields: ['parsed', 'channel'],
  },

  'Intent Classification': {
    agentKey: 'intentClassification',
    input: {
      channel: 'EMAIL',
      content:
        'Please provide a rate quote for FCL shipment from Shanghai to Rotterdam, 20 tons of electronics.',
      subject: 'RFQ: FCL Shanghai to Rotterdam',
      sender: { email: 'buyer@testcorp.com', name: 'John' },
    },
    expectedFields: ['intent', 'confidence'],
  },

  'NLP Extractor': {
    agentKey: 'nlpExtractor',
    input: {
      channel: 'EMAIL',
      content:
        'Need quote for 20 metric tons of consumer electronics from Shanghai port to Rotterdam port.' +
        ' 40ft container, FOB terms. Ship by May 15.',
      subject: 'Rate inquiry',
    },
    expectedFields: ['entities'],
  },

  'Communication Parser': {
    agentKey: 'communicationParser',
    input: {
      channel: 'EMAIL',
      rawContent:
        'From: buyer@testcorp.com\nTo: quotes@banxwayglobal.com\nSubject: RFQ\n\n' +
        'Need a quote for 20 tons Shanghai to Rotterdam.',
    },
    expectedFields: ['parsed'],
  },

  'Data Validator': {
    agentKey: 'dataValidator',
    input: {
      entityType: 'shipment_request',
      data: {
        origin: 'Shanghai, China',
        destination: 'Rotterdam, Netherlands',
        weight: 20,
        weightUnit: 'MT',
        containerType: '40ft',
        commodity: 'Consumer electronics',
        incoterm: 'FOB',
      },
    },
    expectedFields: ['valid', 'issues'],
  },
};

// ---------------------------------------------------------------------------
// Validation runner
// ---------------------------------------------------------------------------

interface ValidationResult {
  name: string;
  agentId: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  details: string;
  duration: number;
}

async function validateAgent(
  name: string,
  testCase: TestCase,
  authHeaders: Record<string, string>,
): Promise<ValidationResult> {
  const agentId = AGENTBUILDER_CONFIG.agents[testCase.agentKey];

  if (!agentId) {
    return {
      name,
      agentId: '(unknown)',
      status: 'ERROR',
      details: `Agent key "${testCase.agentKey}" not found in AGENTBUILDER_CONFIG.agents`,
      duration: 0,
    };
  }

  const start = Date.now();

  try {
    const url = `${AGENTBUILDER_CONFIG.apiUrl}/api/v1/agents/${agentId}/execute`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        input: {
          ...testCase.input,
          callbackUrl: `${BACKEND_URL}/api/v1/agent-webhooks/validation-test`,
        },
      }),
      signal: AbortSignal.timeout(AGENTBUILDER_CONFIG.timeout.execution),
    });

    const duration = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '(could not read body)');
      return {
        name,
        agentId,
        status: 'FAIL',
        details: `HTTP ${response.status}: ${errorText.substring(0, 300)}`,
        duration,
      };
    }

    const result = (await response.json()) as Record<string, unknown>;

    // Async execution — agent accepted the request and will call back
    const execId = result.execution_id ?? result.executionId;
    if (execId) {
      return {
        name,
        agentId,
        status: 'PASS',
        details: `Async execution started (id: ${execId})`,
        duration,
      };
    }

    // Synchronous result — verify expected fields are present
    const output = (result.output ?? result.result ?? result) as Record<string, unknown>;
    const missingFields = testCase.expectedFields.filter((f) => !(f in output));

    if (missingFields.length > 0) {
      return {
        name,
        agentId,
        status: 'FAIL',
        details: `Missing fields: [${missingFields.join(', ')}]. Got keys: [${Object.keys(output).join(', ')}]`,
        duration,
      };
    }

    return {
      name,
      agentId,
      status: 'PASS',
      details: `All expected fields present. Keys: [${Object.keys(output).join(', ')}]`,
      duration,
    };
  } catch (error: unknown) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    return { name, agentId, status: 'ERROR', details: message, duration };
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Banxway Agent LLM Graph Validation ===\n');
  console.log(`API URL : ${AGENTBUILDER_CONFIG.apiUrl}`);
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Agents  : ${Object.keys(AGENTBUILDER_CONFIG.agents).length} configured`);
  console.log(`Tests   : ${Object.keys(TEST_CASES).length} cases\n`);

  // Acquire auth headers (triggers token refresh if needed)
  console.log('Acquiring auth token...');
  let authHeaders: Record<string, string>;
  try {
    authHeaders = await getAuthHeaderAsync();
    const authType = 'Authorization' in authHeaders ? 'Bearer token' : 'Connection ID';
    console.log(`Auth    : ${authType} acquired\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to acquire auth token: ${message}`);
    console.log('Attempting to continue with any cached token...\n');
    authHeaders = {};
  }

  const results: ValidationResult[] = [];

  // Run tests sequentially to avoid rate limiting
  for (const [name, testCase] of Object.entries(TEST_CASES)) {
    process.stdout.write(`  Testing "${name}"... `);
    const result = await validateAgent(name, testCase, authHeaders);
    results.push(result);

    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`${icon} ${result.status} (${result.duration}ms)`);
    console.log(`         Agent ID : ${result.agentId}`);
    console.log(`         ${result.details}\n`);

    // Brief pause between requests to be polite to the API
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;

  console.log('=== Summary ===');
  console.log(`✅ Passed : ${passed}/${results.length}`);
  if (failed > 0) console.log(`❌ Failed : ${failed}`);
  if (errors > 0) console.log(`⚠️  Errors : ${errors}`);

  if (failed > 0 || errors > 0) {
    console.log('\nSome agents did not respond as expected.');
    process.exit(1);
  } else {
    console.log('\nAll agents validated successfully.');
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
