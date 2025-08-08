/**
 * Unit tests for ToolDiscoveryTestSuite
 */

import { ToolDiscoveryTestSuite } from '../../../src/suites/tool-discovery';
import { MCPTestClient } from '../../../src/core/mcp-client';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { MCPTool } from '../../../src/types/mcp';
import { TestContext } from '../../../src/types/test';

// Mock the dependencies
jest.mock('../../../src/core/mcp-client');

describe('ToolDiscoveryTestSuite', () => {
  let suite: ToolDiscoveryTestSuite;
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
        suites: ['tool-discovery'],
        chaos: { enabled: false },
        reporting: { formats: [] },
        parallelism: 1,
      },
    } as any;

    (
      MCPTestClient as jest.MockedClass<typeof MCPTestClient>
    ).mockImplementation(() => mockClient);

    suite = new ToolDiscoveryTestSuite();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Suite Properties', () => {
    it('should have correct metadata', () => {
      expect(suite.name).toBe('tool-discovery');
      expect(suite.version).toBe('1.0.0');
      expect(suite.description).toContain('tool');
      expect(suite.tags).toContain('tools');
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

    it('should reject invalid configuration', () => {
      const config = {};

      const result = suite.validate(config as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Discovery Tests', () => {
    it('should successfully execute tool discovery', async () => {
      const mockTools: MCPTool[] = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue(mockTools);

      const result = await suite.execute(mockContext);

      expect(result.name).toBe('tool-discovery');
      expect(result.status).toBe('passed');
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

    it('should handle tool listing errors gracefully', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.listTools.mockRejectedValue(new Error('List tools failed'));

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
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
});
