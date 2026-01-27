/**
 * Jest Test Setup
 *
 * Global setup for all test suites.
 * Runs before any tests are executed.
 */

import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for integration/e2e tests
jest.setTimeout(30000);

// Mock logger to prevent console spam during tests
jest.mock('../src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test utilities
global.console = {
  ...console,
  // Suppress console.log in tests (use logger instead)
  log: jest.fn(),
  // Keep errors visible
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};
