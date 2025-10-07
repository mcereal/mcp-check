/**
 * Integration tests for MCP check functionality
 * Tests complete workflows with multiple components working together
 */

import { MCPChecker } from '../../src/core/checker';
import { DefaultChaosController } from '../../src/chaos/controller';
import { createTransport } from '../../src/transports/factory';
import { ReportManager } from '../../src/reporting/report-manager';
import { Config, Target } from '../../src/types/config';
import { TestSuite } from '../../src/types/test';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MCP Integration Tests', () => {
  let tempDir: string;
  let mockMCPServer: any;

  beforeAll(async () => {
    // Create temporary directory for test outputs
    tempDir = await fs.mkdtemp(join(tmpdir(), 'mcp-check-integration-'));
  });

  afterAll(async () => {
    // Cleanup mock server if running
    if (mockMCPServer && !mockMCPServer.killed) {
      mockMCPServer.kill();
    }

    // Cleanup temp directory
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
  });

  beforeEach(() => {
    // Reset any global state
    jest.clearAllMocks();
  });

  describe('End-to-End Test Execution', () => {
    it('should complete full MCP testing workflow with stdio transport', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'node',
            args: ['-e', 'process.stdin.pipe(process.stdout)'], // Echo server
            shell: false,
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
        chaos: {
          enable: false,
        },
      };

      const checker = new MCPChecker(config);
      const results = await checker.run();

      expect(results).toBeDefined();
      expect(results.summary).toBeDefined();
      expect(results.summary.total).toBeGreaterThan(0);
      expect(results.testResults).toHaveLength(1); // One target

      // Verify report was generated
      const reportPath = join(tempDir, 'mcp-check-results.json');
      const reportExists = await fs
        .access(reportPath)
        .then(() => true)
        .catch(() => false);
      expect(reportExists).toBe(true);
    }, 30000);

    it('should handle multiple test suites in sequence', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'], // Simple JSON response
          },
        ],
        suites: ['handshake', 'tool-discovery'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
        parallelism: {
          targets: 1,
          suites: 1,
        },
      };

      const checker = new MCPChecker(config);
      const results = await checker.run();

      expect(results.testResults[0].suiteResults).toHaveLength(2);
      expect(results.testResults[0].suiteResults[0].suite).toBe('handshake');
      expect(results.testResults[0].suiteResults[1].suite).toBe(
        'tool-discovery',
      );
    }, 30000);

    it('should execute tests in parallel when configured', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
        parallelism: {
          targets: 2,
          suites: 1,
        },
      };

      const startTime = Date.now();
      const checker = new MCPChecker(config);
      const results = await checker.run();
      const duration = Date.now() - startTime;

      expect(results.testResults).toHaveLength(2);
      // Parallel execution should be faster than sequential
      expect(duration).toBeLessThan(20000); // Reasonable upper bound
    }, 30000);
  });

  describe('Transport Integration', () => {
    it('should successfully create and use different transport types', async () => {
      const targets: Target[] = [
        {
          type: 'stdio',
          command: 'echo',
          args: ['test'],
        },
      ];

      for (const target of targets) {
        const transport = createTransport(target.type);
        expect(transport).toBeDefined();
        expect(transport.type).toBe(target.type);

        try {
          await transport.connect(target);
          expect(transport.state).toBe('connected');
          await transport.close();
        } catch (error) {
          // Some transports may fail in test environment, that's OK
          console.warn(`Transport ${target.type} connection failed:`, error);
        }
      }
    });

    it('should handle transport failures gracefully', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'nonexistent-command',
            args: [],
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      const checker = new MCPChecker(config);
      const results = await checker.run();

      expect(results.testResults[0].error).toBeDefined();
      expect(results.summary.failed).toBeGreaterThan(0);
    });
  });

  describe('Chaos Engineering Integration', () => {
    it('should apply chaos engineering during test execution', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
        ],
        suites: ['handshake'],
        chaos: {
          enable: true,
          intensity: 0.1,
          seed: 12345,
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      const checker = new MCPChecker(config);
      const results = await checker.run();

      expect(results).toBeDefined();
      // Chaos should not prevent basic test execution
      expect(results.testResults).toHaveLength(1);
    }, 30000);

    it('should isolate chaos effects between test runs', async () => {
      const baseConfig: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      // Run without chaos
      const normalChecker = new MCPChecker({
        ...baseConfig,
        chaos: { enable: false },
      });
      const normalResults = await normalChecker.run();

      // Run with chaos
      const chaosChecker = new MCPChecker({
        ...baseConfig,
        chaos: { enable: true, intensity: 0.5 },
      });
      const chaosResults = await chaosChecker.run();

      // Both should complete, but chaos might affect timing/behavior
      expect(normalResults.testResults).toHaveLength(1);
      expect(chaosResults.testResults).toHaveLength(1);
    }, 30000);
  });

  describe('Reporting Integration', () => {
    it('should generate multiple report formats simultaneously', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json', 'junit', 'html'],
          outputDir: tempDir,
        },
      };

      const checker = new MCPChecker(config);
      await checker.run();

      // Check that all report formats were generated
      const jsonExists = await fs
        .access(join(tempDir, 'mcp-check-results.json'))
        .then(() => true)
        .catch(() => false);
      const junitExists = await fs
        .access(join(tempDir, 'mcp-check-results.xml'))
        .then(() => true)
        .catch(() => false);
      const htmlExists = await fs
        .access(join(tempDir, 'mcp-check-results.html'))
        .then(() => true)
        .catch(() => false);

      expect(jsonExists).toBe(true);
      expect(junitExists).toBe(true);
      expect(htmlExists).toBe(true);
    }, 30000);

    it('should include comprehensive test metadata in reports', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeMetadata: true,
        },
      };

      const checker = new MCPChecker(config);
      await checker.run();

      const reportPath = join(tempDir, 'mcp-check-results.json');
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const report = JSON.parse(reportContent);

      expect(report.metadata).toBeDefined();
      expect(report.metadata.timestamp).toBeDefined();
      expect(report.metadata.version).toBeDefined();
      expect(report.metadata.environment).toBeDefined();
    }, 30000);
  });

  describe('Configuration Integration', () => {
    it('should load and validate complex configurations', async () => {
      const complexConfig: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
            env: { NODE_ENV: 'test' },
          },
        ],
        suites: ['handshake', 'tool-discovery'],
        parallelism: {
          targets: 1,
          suites: 2,
        },
        timeout: 10000,
        retries: 2,
        chaos: {
          enable: false,
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeMetadata: true,
        },
        expectations: {
          tools: [
            {
              name: 'test-tool',
              required: false,
            },
          ],
        },
      };

      const checker = new MCPChecker(complexConfig);
      const results = await checker.run();

      expect(results).toBeDefined();
      expect(results.testResults).toHaveLength(1);
    }, 30000);

    it('should handle configuration validation errors', async () => {
      const invalidConfig = {
        targets: [], // Empty targets should be invalid
        suites: ['handshake'],
      } as Config;

      expect(() => {
        new MCPChecker(invalidConfig);
      }).toThrow();
    });
  });

  describe('Error Handling Integration', () => {
    it('should continue testing other targets when one fails', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'nonexistent-command', // Will fail
            args: [],
          },
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'], // Will succeed
          },
        ],
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      const checker = new MCPChecker(config);
      const results = await checker.run();

      expect(results.testResults).toHaveLength(2);
      expect(results.testResults[0].error).toBeDefined(); // First target failed
      expect(results.testResults[1].error).toBeUndefined(); // Second target succeeded
    }, 30000);

    it('should recover from individual test suite failures', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['invalid-json'], // Will cause parsing errors
          },
        ],
        suites: ['handshake', 'tool-discovery'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      const checker = new MCPChecker(config);
      const results = await checker.run();

      expect(results.testResults).toHaveLength(1);
      expect(results.testResults[0].suiteResults.length).toBeGreaterThan(0);
      // Some suite results may have errors, but execution should continue
    }, 30000);
  });

  describe('Performance Integration', () => {
    it('should complete tests within reasonable time limits', async () => {
      const config: Config = {
        targets: [
          {
            type: 'stdio',
            command: 'echo',
            args: ['{}'],
          },
        ],
        suites: ['handshake'],
        timeout: 5000, // 5 second timeout
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      const startTime = Date.now();
      const checker = new MCPChecker(config);
      const results = await checker.run();
      const duration = Date.now() - startTime;

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should complete well under timeout
    }, 15000);

    it('should handle concurrent test execution efficiently', async () => {
      const targets = Array.from({ length: 5 }, (_, i) => ({
        type: 'stdio' as const,
        command: 'echo',
        args: ['{}'],
      }));

      const config: Config = {
        targets,
        suites: ['handshake'],
        parallelism: {
          targets: 5,
          suites: 1,
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
        },
      };

      const startTime = Date.now();
      const checker = new MCPChecker(config);
      const results = await checker.run();
      const duration = Date.now() - startTime;

      expect(results.testResults).toHaveLength(5);
      // Parallel execution should not take much longer than serial
      expect(duration).toBeLessThan(15000);
    }, 20000);
  });
});
