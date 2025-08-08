/**
 * Unit tests for StreamingTestSuite
 */

import { StreamingTestSuite } from '../../../src/suites/streaming';
import { MCPTestClient } from '../../../src/core/mcp-client';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { TestContext } from '../../../src/types/test';

// Mock the dependencies
jest.mock('../../../src/core/mcp-client');

describe('StreamingTestSuite', () => {
  let suite: StreamingTestSuite;
  let mockClient: jest.Mocked<MCPTestClient>;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<Transport>;
  let mockContext: TestContext;

  beforeEach(() => {
    // Create mock implementations
    mockClient = {
      connectWithCustomTransport: jest.fn(),
      connectFromTarget: jest.fn(),
      listTools: jest.fn(),
      callTool: jest.fn(),
      close: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockTransport = {
      connect: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    mockContext = {
      client: mockClient,
      transport: mockTransport,
      logger: mockLogger,
      config: {
        $schema: 'test',
        target: { type: 'stdio', command: 'test' },
        suites: ['streaming'],
        chaos: { enabled: false },
        reporting: { formats: [] },
        parallelism: 1,
      },
    } as any;

    (
      MCPTestClient as jest.MockedClass<typeof MCPTestClient>
    ).mockImplementation(() => mockClient);

    suite = new StreamingTestSuite();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Suite Properties', () => {
    it('should have correct metadata', () => {
      expect(suite.name).toBe('streaming');
      expect(suite.version).toBe('1.0.0');
      expect(suite.description).toContain('streaming');
      expect(suite.tags).toContain('streaming');
      expect(suite.tags).toContain('performance');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required configuration', () => {
      const config = {
        target: { type: 'stdio' as const, command: 'test' },
      };

      const result = suite.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should warn when no tools are configured', () => {
      const config = {
        target: { type: 'stdio' as const, command: 'test' },
        expectations: { tools: [] },
      };

      const result = suite.validate(config);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings!.some((w) =>
          w.includes('streaming tests may be limited'),
        ),
      ).toBe(true);
    });

    it('should reject configuration without target', () => {
      const config = {};

      const result = suite.validate(config as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Streaming Tests', () => {
    it('should successfully execute streaming tests', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([
        {
          name: 'streaming-tool',
          description: 'A streaming tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ]);

      const result = await suite.execute(mockContext);

      expect(result.name).toBe('streaming');
      expect(result.cases.length).toBeGreaterThan(0);
    });

    it('should handle connection failures', async () => {
      mockClient.connectFromTarget.mockRejectedValue(
        new Error('Connection failed'),
      );
      mockClient.connectWithCustomTransport.mockRejectedValue(
        new Error('Transport failed'),
      );

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
      expect(result.cases.length).toBeGreaterThan(0);
    });

    it('should test streaming capabilities when tools are available', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([
        {
          name: 'streaming-tool',
          description: 'A streaming tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      ]);

      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Streaming response' }],
      });

      const result = await suite.execute(mockContext);

      expect(
        result.cases.some(
          (c) => c.name.includes('tool') || c.name.includes('streaming'),
        ),
      ).toBe(true);
    });

    it('should handle streaming errors gracefully', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([
        {
          name: 'streaming-tool',
          description: 'A streaming tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ]);

      mockClient.callTool.mockRejectedValue(new Error('Streaming failed'));

      const result = await suite.execute(mockContext);

      expect(result.cases.some((c) => c.status === 'failed')).toBe(true);
    });

    it('should use custom transport when SDK connection fails', async () => {
      mockClient.connectFromTarget.mockRejectedValue(new Error('SDK failed'));
      mockClient.connectWithCustomTransport.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([]);

      const result = await suite.execute(mockContext);

      expect(mockClient.connectWithCustomTransport).toHaveBeenCalledWith(
        mockTransport,
      );
    });
  });

  describe('Performance Testing', () => {
    it('should track execution duration', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([]);

      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle long-running operations', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([
        {
          name: 'long-running-tool',
          description: 'A long-running tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ]);

      // Simulate a long-running operation
      mockClient.callTool.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  content: [{ type: 'text', text: 'Long operation complete' }],
                }),
              100,
            ),
          ),
      );

      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThan(50); // Should take at least some time
    });
  });
});
