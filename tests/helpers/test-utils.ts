/**
 * Test utilities and helpers
 */

import { CheckConfig, ResolvedCheckConfig } from '../../src/types/config';
import { resolveConfig } from '../../src/core/config';
import { MockMCPServer, MockServerConfig } from './mock-server';

/**
 * Create a test configuration with sensible defaults
 */
export function createTestConfig(
  overrides: Partial<CheckConfig> = {},
): ResolvedCheckConfig {
  const defaultConfig: CheckConfig = {
    target: {
      type: 'stdio',
      command: 'echo',
      args: ['{}'],
    },
    expectations: {
      minProtocolVersion: '2024-11-05',
      capabilities: [],
    },
    suites: ['handshake'],
    timeouts: {
      connectMs: 5000,
      invokeMs: 5000,
      shutdownMs: 1000,
    },
    chaos: {
      enable: false,
    },
    reporting: {
      formats: ['json'],
      outputDir: './test-reports',
      includeFixtures: false,
    },
    ...overrides,
  };

  return resolveConfig(defaultConfig);
}

/**
 * Create a mock server for testing
 */
export async function createMockServer(
  config: MockServerConfig,
): Promise<MockMCPServer> {
  const server = new MockMCPServer(config);
  await server.start();
  return server;
}

/**
 * Wait for a condition to be true
 */
export function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100,
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

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Condition not met within ${timeoutMs}ms`));
        return;
      }

      setTimeout(check, checkIntervalMs);
    };

    check();
  });
}

/**
 * Create a temporary directory for test outputs
 */
export function createTempDir(): string {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  const tmpDir = path.join(
    os.tmpdir(),
    'mcp-check-test',
    Date.now().toString(),
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Clean up temporary directory
 */
export function cleanupTempDir(dir: string): void {
  const fs = require('fs');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}
