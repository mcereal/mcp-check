/**
 * End-to-end tests for the MCPChecker core functionality
 */

import { MCPChecker } from '../../src/core/checker';
import { DefaultTransportFactory } from '../../src/transports/factory';
import { createLogger } from '../../src/core/logger';
import {
  createTestConfig,
  createMockServer,
  cleanupTempDir,
  createTempDir,
} from '../helpers/test-utils';
import { MockMCPServer } from '../helpers/mock-server';

// Import test suites
import { HandshakeTestSuite } from '../../src/suites/handshake';
import { ToolDiscoveryTestSuite } from '../../src/suites/tool-discovery';
import { ToolInvocationTestSuite } from '../../src/suites/tool-invocation';

describe('MCPChecker E2E Tests', () => {
  let mockServer: MockMCPServer;
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop();
    }
    cleanupTempDir(tempDir);
  });

  describe('Basic Functionality', () => {
    it('should successfully run handshake test with mock stdio server', async () => {
      // Create mock server
      mockServer = await createMockServer({
        mode: 'stdio',
      });

      // Create test configuration
      const config = createTestConfig({
        target: mockServer.getConnectionConfig(),
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      // Create checker
      const logger = createLogger('error'); // Quiet for tests
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      // Run tests
      const results = await checker.run();

      // Verify results
      expect(results.summary.total).toBeGreaterThan(0);
      expect(results.summary.failed).toBe(0);
      expect(results.suites).toHaveLength(1);
      expect(results.suites[0].name).toBe('handshake');
      expect(results.suites[0].status).toBe('passed');
    }, 10000);

    it('should handle tool discovery and invocation', async () => {
      // Create mock server with tool responses
      mockServer = await createMockServer({
        mode: 'stdio',
        responses: {
          'tools/list': {
            tools: [
              {
                name: 'test-tool',
                description: 'A test tool',
                inputSchema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                  },
                  required: ['message'],
                },
              },
            ],
          },
          'tools/call': {
            content: [
              {
                type: 'text',
                text: 'Tool executed successfully',
              },
            ],
          },
        },
      });

      const config = createTestConfig({
        target: mockServer.getConnectionConfig(),
        suites: ['handshake', 'tool-discovery', 'tool-invocation'],
        expectations: {
          minProtocolVersion: '2024-11-05',
          capabilities: ['tools'],
          tools: [
            {
              name: 'test-tool',
              required: true,
            },
          ],
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuites([
        new HandshakeTestSuite(),
        new ToolDiscoveryTestSuite(),
        new ToolInvocationTestSuite(),
      ]);

      const results = await checker.run();

      expect(results.summary.total).toBeGreaterThan(0);
      expect(results.summary.failed).toBe(0);
      expect(results.suites).toHaveLength(3);

      // Check each suite passed
      const handshakeSuite = results.suites.find((s) => s.name === 'handshake');
      const toolDiscoverySuite = results.suites.find(
        (s) => s.name === 'tool-discovery',
      );
      const toolInvocationSuite = results.suites.find(
        (s) => s.name === 'tool-invocation',
      );

      expect(handshakeSuite?.status).toBe('passed');
      expect(toolDiscoverySuite?.status).toBe('passed');
      expect(toolInvocationSuite?.status).toBe('passed');
    }, 15000);
  });

  describe('Error Handling', () => {
    it('should handle connection failures gracefully', async () => {
      const config = createTestConfig({
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 9999, // Non-existent port
        },
        suites: ['handshake'],
        timeouts: {
          connectMs: 1000,
          invokeMs: 1000,
          shutdownMs: 1000,
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      // Should throw due to connection failure
      await expect(checker.run()).rejects.toThrow();
    }, 5000);

    it('should handle server errors and report them properly', async () => {
      // Create mock server that returns errors
      mockServer = await createMockServer({
        mode: 'stdio',
        errors: {
          initialize: 'Server initialization failed',
        },
      });

      const config = createTestConfig({
        target: mockServer.getConnectionConfig(),
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: true,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      const results = await checker.run();

      expect(results.summary.failed).toBeGreaterThan(0);
      expect(results.suites[0].status).toBe('failed');

      // Should have error details
      const failedCases = results.suites[0].cases.filter(
        (c) => c.status === 'failed',
      );
      expect(failedCases.length).toBeGreaterThan(0);
      expect(failedCases[0].error?.message).toContain(
        'Server initialization failed',
      );
    }, 10000);
  });

  describe('Configuration Validation', () => {
    it('should validate expectations against server capabilities', async () => {
      // Create mock server with limited capabilities
      mockServer = await createMockServer({
        mode: 'stdio',
        responses: {
          initialize: {
            protocolVersion: '2024-11-05',
            capabilities: {
              // No tools capability
            },
            serverInfo: {
              name: 'limited-server',
              version: '1.0.0',
            },
          },
        },
      });

      const config = createTestConfig({
        target: mockServer.getConnectionConfig(),
        suites: ['handshake'],
        expectations: {
          minProtocolVersion: '2024-11-05',
          capabilities: ['tools', 'resources'], // Expect capabilities that server doesn't have
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      const results = await checker.run();

      // Should have warnings or failures about missing capabilities
      expect(results.summary.warnings + results.summary.failed).toBeGreaterThan(
        0,
      );
    }, 10000);

    it('should enforce minimum protocol version requirements', async () => {
      // Create mock server with old protocol version
      mockServer = await createMockServer({
        mode: 'stdio',
        responses: {
          initialize: {
            protocolVersion: '1.0.0', // Old version
            capabilities: {},
            serverInfo: {
              name: 'old-server',
              version: '1.0.0',
            },
          },
        },
      });

      const config = createTestConfig({
        target: mockServer.getConnectionConfig(),
        suites: ['handshake'],
        expectations: {
          minProtocolVersion: '2024-11-05', // Require newer version
        },
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      const results = await checker.run();

      // Should fail due to version mismatch
      expect(results.summary.failed).toBeGreaterThan(0);

      const failedCases = results.suites[0].cases.filter(
        (c) => c.status === 'failed',
      );
      expect(
        failedCases.some((c) => c.error?.message.includes('protocol version')),
      ).toBe(true);
    }, 10000);
  });

  describe('Multiple Transport Types', () => {
    it('should work with TCP transport', async () => {
      // Create TCP mock server
      mockServer = await createMockServer({
        mode: 'tcp',
        port: 18080,
      });

      const config = createTestConfig({
        target: {
          type: 'tcp',
          host: 'localhost',
          port: 18080,
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      const results = await checker.run();

      expect(results.summary.failed).toBe(0);
      expect(results.suites[0].status).toBe('passed');
    }, 10000);

    it('should work with WebSocket transport', async () => {
      // Create WebSocket mock server
      mockServer = await createMockServer({
        mode: 'websocket',
        port: 18081,
      });

      const config = createTestConfig({
        target: {
          type: 'websocket',
          url: 'ws://localhost:18081',
        },
        suites: ['handshake'],
        reporting: {
          formats: ['json'],
          outputDir: tempDir,
          includeFixtures: false,
        },
      });

      const logger = createLogger('error');
      const checker = new MCPChecker(config, logger);
      checker.setTransportFactory(new DefaultTransportFactory());
      checker.registerSuite(new HandshakeTestSuite());

      const results = await checker.run();

      expect(results.summary.failed).toBe(0);
      expect(results.suites[0].status).toBe('passed');
    }, 10000);
  });
});
