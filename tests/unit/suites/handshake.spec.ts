/**
 * Unit tests for HandshakeTestSuite
 */

import { HandshakeTestSuite } from '../../../src/suites/handshake';
import { TestContext, TestSuiteResult } from '../../../src/types/test';
import { MCPTestClient } from '../../../src/core/mcp-client';
import { CheckConfig } from '../../../src/types/config';
import { Transport } from '../../../src/types/transport';
import { Logger } from '../../../src/types/reporting';

// Mock dependencies
jest.mock('../../../src/core/mcp-client');

describe('HandshakeTestSuite', () => {
  let suite: HandshakeTestSuite;
  let mockContext: TestContext;
  let mockClient: jest.Mocked<MCPTestClient>;
  let mockTransport: jest.Mocked<Transport>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    suite = new HandshakeTestSuite();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue(mockLogger),
    };

    mockTransport = {
      type: 'stdio',
      state: 'connected',
      stats: { messagesSent: 0, messagesReceived: 0, bytesTransferred: 0 },
      connect: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      waitForMessage: jest.fn(),
    } as any;

    mockClient = {
      initialize: jest.fn(),
      close: jest.fn(),
      listTools: jest.fn(),
      callTool: jest.fn(),
      listResources: jest.fn(),
      readResource: jest.fn(),
      listPrompts: jest.fn(),
      getPrompt: jest.fn(),
      ping: jest.fn(),
      onNotification: jest.fn(),
    } as any;

    (
      MCPTestClient as jest.MockedClass<typeof MCPTestClient>
    ).mockImplementation(() => mockClient);

    mockContext = {
      transport: mockTransport,
      config: {
        target: { type: 'stdio', command: 'test', args: [] },
        expectations: {
          minProtocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
        timeouts: {
          connectMs: 5000,
          invokeMs: 10000,
          shutdownMs: 3000,
        },
        version: '1.0.0',
        environment: {
          platform: 'test',
          nodeVersion: '20.0.0',
          architecture: 'x64',
        },
      },
      logger: mockLogger,
      chaos: undefined,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Suite Properties', () => {
    it('should have correct metadata', () => {
      expect(suite.name).toBe('handshake');
      expect(suite.version).toBe('1.0.0');
      expect(suite.description).toContain('handshake');
      expect(suite.tags).toContain('core');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const config = {
        target: { type: 'stdio', command: 'test', args: [] },
        expectations: { minProtocolVersion: '2024-11-05' },
      };

      const result = suite.validate(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should accept configuration without expectations', () => {
      const config = {
        target: { type: 'stdio', command: 'test', args: [] },
      };

      const result = suite.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('Test Execution', () => {
    it('should execute successful handshake test', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'test-server',
            version: '1.0.0',
          },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(mockContext);

      expect(result.name).toBe('handshake');
      expect(result.status).toBe('passed');
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.cases.length).toBeGreaterThan(0);

      // Check that connection establishment test passed
      const connectionCase = result.cases.find(
        (c) => c.name === 'connection-establishment',
      );
      expect(connectionCase).toBeDefined();
      expect(connectionCase!.status).toBe('passed');
      expect(connectionCase!.details).toMatchObject({
        serverInfo: initResponse.result.serverInfo,
        protocolVersion: initResponse.result.protocolVersion,
      });
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Connection failed');
      mockClient.initialize.mockRejectedValue(error);

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
      expect(result.cases[0].status).toBe('failed');
      expect(result.cases[0].error).toMatchObject({
        type: 'ConnectionError',
        message: 'Connection failed',
      });
    });

    it('should validate protocol version requirements', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '1.0.0', // Old version
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(mockContext);

      // Should have version validation test case
      const versionCase = result.cases.find(
        (c) => c.name === 'protocol-version-validation',
      );
      expect(versionCase).toBeDefined();
      expect(versionCase!.status).toBe('failed');
      expect(versionCase!.error?.message).toContain('protocol version');
    });

    it('should validate server capabilities', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {}, // Missing expected tools capability
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(mockContext);

      // Should have capability validation test case
      const capabilityCase = result.cases.find(
        (c) => c.name === 'capability-validation',
      );
      expect(capabilityCase).toBeDefined();
      expect(capabilityCase!.status).toBe('failed');
      expect(capabilityCase!.error?.message).toContain('capabilities');
    });

    it('should handle missing minimum protocol version expectation', async () => {
      const contextWithoutVersionReq = {
        ...mockContext,
        config: {
          ...mockContext.config,
          expectations: {
            capabilities: ['tools'],
          },
        },
      };

      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '1.0.0',
          capabilities: { tools: {} },
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(contextWithoutVersionReq);

      // Version validation should pass when no minimum is specified
      const versionCase = result.cases.find(
        (c) => c.name === 'protocol-version-validation',
      );
      expect(versionCase?.status).toBe('passed');
    });

    it('should handle maximum protocol version validation', async () => {
      const contextWithMaxVersion = {
        ...mockContext,
        config: {
          ...mockContext.config,
          expectations: {
            minProtocolVersion: '1.0.0',
            maxProtocolVersion: '2.0.0',
          },
        },
      };

      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '3.0.0', // Too new
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(contextWithMaxVersion);

      const versionCase = result.cases.find(
        (c) => c.name === 'protocol-version-validation',
      );
      expect(versionCase!.status).toBe('failed');
      expect(versionCase!.error?.message).toContain('maximum');
    });

    it('should test server info validation', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: {
            name: 'test-server',
            version: '1.0.0',
          },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(mockContext);

      const serverInfoCase = result.cases.find(
        (c) => c.name === 'server-info-validation',
      );
      expect(serverInfoCase).toBeDefined();
      expect(serverInfoCase!.status).toBe('passed');
      expect(serverInfoCase!.details).toMatchObject({
        serverName: 'test-server',
        serverVersion: '1.0.0',
      });
    });

    it('should handle missing server info', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          // Missing serverInfo
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(mockContext);

      const serverInfoCase = result.cases.find(
        (c) => c.name === 'server-info-validation',
      );
      expect(serverInfoCase!.status).toBe('failed');
      expect(serverInfoCase!.error?.message).toContain('server info');
    });

    it('should validate unexpected capabilities in strict mode', async () => {
      const strictContext = {
        ...mockContext,
        config: {
          ...mockContext.config,
          expectations: {
            capabilities: ['tools'], // Only expect tools
          },
          strict: true,
        },
      };

      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {}, // Unexpected capability
            prompts: {}, // Another unexpected capability
          },
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(strictContext);

      const capabilityCase = result.cases.find(
        (c) => c.name === 'capability-validation',
      );
      expect(capabilityCase!.status).toBe('warning');
      expect(capabilityCase!.details?.unexpectedCapabilities).toEqual([
        'resources',
        'prompts',
      ]);
    });

    it('should always close client even on errors', async () => {
      mockClient.initialize.mockRejectedValue(new Error('Failed'));

      await suite.execute(mockContext);

      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed initialization response', async () => {
      const malformedResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          // Missing required fields
        },
      };

      mockClient.initialize.mockResolvedValue(malformedResponse);

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
      expect(result.cases[0].status).toBe('failed');
    });

    it('should handle client close errors', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);
      mockClient.close.mockRejectedValue(new Error('Close failed'));

      // Should not throw despite close error
      const result = await suite.execute(mockContext);

      expect(result.status).toBe('passed');
      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should handle version comparison edge cases', async () => {
      const contextWithComplexVersion = {
        ...mockContext,
        config: {
          ...mockContext.config,
          expectations: {
            minProtocolVersion: '2024-11-05',
            maxProtocolVersion: '2024-12-31',
          },
        },
      };

      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05', // Exactly minimum
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(contextWithComplexVersion);

      const versionCase = result.cases.find(
        (c) => c.name === 'protocol-version-validation',
      );
      expect(versionCase!.status).toBe('passed');
    });
  });

  describe('Performance Tracking', () => {
    it('should track connection timing', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      // Add delay to simulate connection time
      mockClient.initialize.mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(initResponse), 50)),
      );

      const result = await suite.execute(mockContext);

      const connectionCase = result.cases.find(
        (c) => c.name === 'connection-establishment',
      );
      expect(connectionCase!.durationMs).toBeGreaterThan(40);
      expect(connectionCase!.details?.connectionTimeMs).toBeGreaterThan(40);
    });

    it('should measure total suite duration', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      mockClient.initialize.mockResolvedValue(initResponse);

      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThan(0);

      // Total duration should be at least the sum of test case durations
      const totalCaseDuration = result.cases.reduce(
        (sum, testCase) => sum + testCase.durationMs,
        0,
      );
      expect(result.durationMs).toBeGreaterThanOrEqual(totalCaseDuration);
    });
  });
});
