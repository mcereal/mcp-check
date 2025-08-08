/**
 * Unit tests for HandshakeTestSuite
 */

import { HandshakeTestSuite } from '../../../src/suites/handshake';
import { TestContext } from '../../../src/types/test';
import { ResolvedCheckConfig } from '../../../src/types/config';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { MCPTestClient } from '../../../src/core/mcp-client';
import { EventEmitter } from 'events';

// Mock the MCPTestClient
jest.mock('../../../src/core/mcp-client');

describe('HandshakeTestSuite', () => {
  let suite: HandshakeTestSuite;
  let mockContext: TestContext;
  let mockConfig: ResolvedCheckConfig;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<Transport> & EventEmitter;
  let mockClient: jest.Mocked<MCPTestClient>;

  beforeEach(() => {
    suite = new HandshakeTestSuite();

    mockConfig = {
      $schema: 'https://example.com/schema',
      target: {
        type: 'stdio',
        command: 'node',
        args: ['test-server.js'],
      },
      suites: ['handshake'],
      expectations: {
        minProtocolVersion: '2024-11-05',
        capabilities: ['tools', 'resources'],
      },
      timeouts: {
        connectMs: 5000,
        invokeMs: 10000,
        shutdownMs: 3000,
      },
      chaos: {
        enable: false,
      },
      reporting: {
        outputDir: './test-output',
        formats: ['json'],
      },
      parallelism: {},
      version: '1.0.0',
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue({} as Logger),
    };

    mockTransport = new EventEmitter() as jest.Mocked<Transport> & EventEmitter;
    Object.defineProperty(mockTransport, 'type', { value: 'stdio' });
    Object.defineProperty(mockTransport, 'state', { value: 'connected' });
    Object.defineProperty(mockTransport, 'stats', {
      value: {
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
        connectionTime: 100,
      },
    });

    mockClient = {
      connectFromTarget: jest.fn(),
      connectWithCustomTransport: jest.fn(),
      listTools: jest.fn(),
      callTool: jest.fn(),
      listResources: jest.fn(),
      readResource: jest.fn(),
      listPrompts: jest.fn(),
      getPrompt: jest.fn(),
      ping: jest.fn(),
      close: jest.fn(),
      getServerCapabilities: jest.fn(),
      getServerVersion: jest.fn(),
    } as any;

    // Mock the constructor to return our mock
    (
      MCPTestClient as jest.MockedClass<typeof MCPTestClient>
    ).mockImplementation(() => mockClient);

    mockContext = {
      config: mockConfig,
      transport: mockTransport,
      logger: mockLogger,
      fixtures: {} as any,
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
      expect(suite.tags).toContain('protocol');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const config = {
        target: {
          type: 'stdio' as const,
          command: 'node',
          args: ['test.js'],
        },
        expectations: {
          minProtocolVersion: '2024-11-05',
          capabilities: ['tools'],
        },
      };

      const result = suite.validate(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject configuration without target', () => {
      const config = {
        expectations: {
          minProtocolVersion: '2024-11-05',
        },
      };

      const result = suite.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target configuration is required');
    });

    it('should reject invalid target types', () => {
      const config = {
        target: {
          type: 'invalid' as any,
          command: 'node',
        },
      };

      const result = suite.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Test Execution', () => {
    it('should successfully execute handshake test', async () => {
      // Mock successful server responses
      mockClient.getServerCapabilities.mockReturnValue({
        tools: {},
        resources: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await suite.execute(mockContext);

      expect(result.name).toBe('handshake');
      expect(result.status).toBe('passed');
      expect(result.cases.length).toBeGreaterThan(0);
      expect(mockClient.connectWithCustomTransport).toHaveBeenCalledWith(
        mockTransport,
      );
    });

    it('should handle connection failures', async () => {
      mockClient.connectWithCustomTransport.mockRejectedValue(
        new Error('Connection failed'),
      );

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
      expect(result.setup?.error).toContain('Connection failed');
    });

    it('should detect protocol version mismatches', async () => {
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
        protocolVersion: '2023-01-01', // Old version
      });
      mockClient.getServerCapabilities.mockReturnValue({});

      const result = await suite.execute(mockContext);

      expect(
        result.cases.some((c) => c.name.includes('protocol version')),
      ).toBe(true);
    });

    it('should detect missing required capabilities', async () => {
      mockClient.getServerCapabilities.mockReturnValue({
        // Missing tools capability
        resources: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      mockContext.config.expectations.capabilities = ['tools'];

      const result = await suite.execute(mockContext);

      expect(result.cases.some((c) => c.name.includes('capabilities'))).toBe(
        true,
      );
    });

    it('should validate server info', async () => {
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.getServerCapabilities.mockReturnValue({});

      const result = await suite.execute(mockContext);

      expect(result.cases.some((c) => c.name.includes('server info'))).toBe(
        true,
      );
    });

    it('should test ping functionality', async () => {
      mockClient.ping.mockResolvedValue();
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await suite.execute(mockContext);

      expect(mockClient.ping).toHaveBeenCalled();
      expect(result.cases.some((c) => c.name.includes('ping'))).toBe(true);
    });

    it('should handle ping failures gracefully', async () => {
      mockClient.ping.mockRejectedValue(new Error('Ping failed'));
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await suite.execute(mockContext);

      const pingCase = result.cases.find((c) => c.name.includes('ping'));
      expect(pingCase?.status).toBe('failed');
      expect(pingCase?.error).toContain('Ping failed');
    });

    it('should handle timeout scenarios', async () => {
      // Simulate a very short timeout
      mockContext.config.timeouts.connectMs = 1;

      // Make connection take longer than timeout
      mockClient.connectWithCustomTransport.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      const result = await suite.execute(mockContext);

      expect(result.setup?.error).toBeDefined();
    });

    it('should cleanup on test completion', async () => {
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      await suite.execute(mockContext);

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should cleanup even when tests fail', async () => {
      mockClient.connectWithCustomTransport.mockRejectedValue(
        new Error('Connection failed'),
      );

      await suite.execute(mockContext);

      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed server responses', async () => {
      mockClient.getServerVersion.mockReturnValue(null as any);
      mockClient.getServerCapabilities.mockReturnValue(null as any);

      const result = await suite.execute(mockContext);

      expect(result.cases.some((c) => c.status === 'failed')).toBe(true);
    });

    it('should handle partial capability information', async () => {
      mockClient.getServerCapabilities.mockReturnValue({
        tools: {}, // Has tools
        // Missing resources
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      mockContext.config.expectations.capabilities = ['tools', 'resources'];

      const result = await suite.execute(mockContext);

      const capabilityTest = result.cases.find((c) =>
        c.name.includes('capabilities'),
      );
      expect(capabilityTest?.status).toBe('failed');
    });

    it('should handle empty expectations', async () => {
      mockContext.config.expectations = {} as any;
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('passed');
    });
  });

  describe('Performance Tracking', () => {
    it('should track test execution time', async () => {
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.setup?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track individual test case durations', async () => {
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await suite.execute(mockContext);

      result.cases.forEach((testCase) => {
        expect(testCase.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
