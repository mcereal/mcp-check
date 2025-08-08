/**
 * Comprehensive test utilities for mcp-check
 */

import { Logger } from '../../src/types/reporting';
import { ResolvedCheckConfig } from '../../src/types/config';
import { TestContext, TestFixture } from '../../src/types/test';
import { MockTransport, createMockServer } from './test-server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Create a mock logger for testing
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockImplementation(() => createMockLogger()),
  };
}

/**
 * Create a minimal test configuration
 */
export function createTestConfig(
  overrides: Partial<ResolvedCheckConfig> = {},
): ResolvedCheckConfig {
  return {
    $schema: 'https://example.com/schema.json',
    target: {
      type: 'stdio',
      command: 'node',
      args: ['test-server.js'],
    },
    suites: ['handshake'],
    expectations: {
      minProtocolVersion: '2024-11-05',
      capabilities: [],
    },
    timeouts: {
      connectMs: 5000,
      invokeMs: 10000,
      shutdownMs: 3000,
    },
    chaos: {
      enable: false,
      seed: 12345,
      network: {
        delayMs: [0, 100],
        dropProbability: 0,
        duplicateProbability: 0,
        reorderProbability: 0,
        corruptProbability: 0,
      },
      protocol: {
        injectAbortProbability: 0,
        malformedJsonProbability: 0,
        unexpectedMessageProbability: 0,
        invalidSchemaoProbability: 0,
      },
      timing: {
        clockSkewMs: [0, 50],
        processingDelayMs: [0, 50],
        timeoutReductionFactor: 1.0,
      },
      intensity: 0,
    },
    reporting: {
      outputDir: './test-output',
      formats: ['json'],
      includeFixtures: true,
    },
    parallelism: {
      maxConcurrentTests: 1,
      maxConcurrentConnections: 1,
    },
    version: '1.0.0',
    environment: {
      platform: 'test',
      nodeVersion: '20.0.0',
      architecture: 'x64',
    },
    ...overrides,
  };
}

/**
 * Create a test context
 */
export function createTestContext(
  configOverrides: Partial<ResolvedCheckConfig> = {},
  transportOverrides?: Partial<MockTransport>,
): TestContext {
  const config = createTestConfig(configOverrides);
  const logger = createMockLogger();
  const transport = new MockTransport();

  // Apply transport overrides if provided
  if (transportOverrides) {
    Object.assign(transport, transportOverrides);
  }

  return {
    config,
    transport: transport as any,
    logger,
    fixtures: {
      generate: jest.fn(),
      save: jest.fn(),
      load: jest.fn(),
      list: jest.fn(),
    },
  };
}

/**
 * Create a test fixture
 */
export function createTestFixture(
  overrides: Partial<TestFixture> = {},
): TestFixture {
  return {
    id: 'test-fixture-1',
    description: 'Test fixture for unit testing',
    timestamp: new Date().toISOString(),
    target: {
      type: 'stdio',
      command: 'node',
      args: ['test-server.js'],
    },
    scenario: {
      expectedBehavior: 'Server should respond correctly',
      actualBehavior: 'Server responded as expected',
    },
    reproduction: {
      command: 'npm test',
      environment: {
        NODE_ENV: 'test',
      },
    },
    ...overrides,
  };
}

/**
 * Create a temporary directory for testing
 */
export function createTempDir(prefix: string = 'mcp-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Clean up temporary directory
 */
export function cleanupTempDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Wait for a condition with timeout
 */
export function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 1000,
  intervalMs = 50,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        const result = await condition();
        if (result) {
          resolve();
          return;
        }
      } catch (error) {
        // Continue checking
      }

      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error(`Condition not met within ${timeoutMs}ms`));
        return;
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a function throws with a specific message
 */
export async function expectToThrow(
  fn: () => Promise<any> | any,
  expectedMessage?: string | RegExp,
): Promise<void> {
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  expect(error).toBeDefined();

  if (expectedMessage) {
    if (typeof expectedMessage === 'string') {
      expect(error!.message).toContain(expectedMessage);
    } else {
      expect(error!.message).toMatch(expectedMessage);
    }
  }
}

/**
 * Test data generators
 */
export const testData = {
  randomString(length = 10): string {
    return Math.random()
      .toString(36)
      .substring(2, 2 + length);
  },

  randomNumber(min = 0, max = 100): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  randomId(): string {
    return `${this.randomString(8)}-${this.randomString(4)}-${this.randomString(4)}-${this.randomString(4)}-${this.randomString(12)}`;
  },
};
