/**
 * Unit tests for HandshakeTestSuite
 */

import { HandshakeTestSuite } from '../../../src/suites/handshake';
import { MCPTestClient } from '../../../src/core/mcp-client';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { TestContext } from '../../../src/types/test';

// Mock the dependencies
jest.mock('../../../src/core/mcp-client');

describe('HandshakeTestSuite', () => {
  let suite: HandshakeTestSuite;
  let mockClient: jest.Mocked<MCPTestClient>;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<Transport>;
  let mockContext: TestContext;

  beforeEach(() => {
    // Create mock implementations
    mockClient = {
      connectWithCustomTransport: jest.fn(),
      connectFromTarget: jest.fn(),
      getServerCapabilities: jest.fn(),
      getServerVersion: jest.fn(),
      ping: jest.fn(),
      listTools: jest.fn(),
      listResources: jest.fn(),
      listPrompts: jest.fn(),
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
        suites: ['handshake'],
        chaos: { enabled: false },
        reporting: { formats: [] },
        parallelism: 1,
        expectations: {
          minProtocolVersion: '2024-11-05',
          requireTools: true,
          requireResources: false,
          requirePrompts: false,
        },
      },
    } as any;

    (
      MCPTestClient as jest.MockedClass<typeof MCPTestClient>
    ).mockImplementation(() => mockClient);

    suite = new HandshakeTestSuite();
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
    it('should validate required configuration', () => {
      const config = {
        target: { type: 'stdio' as const, command: 'test' },
      };

      const result = suite.validate(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject configuration without target', () => {
      const config = {};

      const result = suite.validate(config as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Target configuration is required');
    });

    it('should reject invalid protocol version format', () => {
      const config = {
        target: { type: 'stdio' as const, command: 'test' },
        expectations: {
          minProtocolVersion: 'invalid-version',
        },
      };

      const result = suite.validate(config as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Invalid minProtocolVersion format');
    });

    it('should accept valid protocol version format', () => {
      const config = {
        target: { type: 'stdio' as const, command: 'test' },
        expectations: {
          minProtocolVersion: '2024-11-05',
        },
      };

      const result = suite.validate(config as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('Handshake Tests', () => {
    it('should successfully execute handshake tests with SDK transport', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        tools: {},
        resources: {},
        prompts: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([]);
      mockClient.listResources.mockResolvedValue([]);
      mockClient.listPrompts.mockResolvedValue([]);

      const result = await suite.execute(mockContext);

      expect(result.name).toBe('handshake');
      expect(result.status).toBe('passed');
      expect(result.cases.length).toBeGreaterThan(0);
      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'connection-establishment',
            status: 'passed',
          }),
        ]),
      );
    });

    it('should fallback to custom transport when SDK transport fails', async () => {
      mockClient.connectFromTarget.mockRejectedValue(new Error('SDK failed'));
      mockClient.connectWithCustomTransport.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);

      const result = await suite.execute(mockContext);

      expect(mockClient.connectWithCustomTransport).toHaveBeenCalledWith(
        mockTransport,
      );
      expect(result.status).toBe('passed');
    });

    it('should handle connection failures gracefully', async () => {
      mockClient.connectFromTarget.mockRejectedValue(
        new Error('Connection failed'),
      );
      mockClient.connectWithCustomTransport.mockRejectedValue(
        new Error('Transport failed'),
      );

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'connection-establishment',
            status: 'failed',
            error: expect.objectContaining({
              type: 'ConnectionError',
              message: expect.stringContaining(
                'Failed to establish connection',
              ),
            }),
          }),
        ]),
      );
    });

    it('should validate server capabilities', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        tools: {},
        resources: {},
        prompts: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'server-capabilities-validation',
            status: 'passed',
          }),
        ]),
      );
    });

    it('should fail capability validation when required capabilities are missing', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        // Missing tools capability
        resources: {},
        prompts: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'server-capabilities-validation',
            status: 'failed',
            error: expect.objectContaining({
              type: 'CapabilitiesMismatch',
            }),
          }),
        ]),
      );
    });

    it('should test ping functionality', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'ping-test',
            status: 'passed',
          }),
        ]),
      );
      expect(mockClient.ping).toHaveBeenCalled();
    });

    it('should handle ping failures', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockRejectedValue(new Error('Ping failed'));

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'ping-test',
            status: 'failed',
            error: expect.objectContaining({
              type: 'PingError',
            }),
          }),
        ]),
      );
    });

    it('should discover tools when supported', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        tools: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'tool-discovery',
            status: 'passed',
            details: expect.objectContaining({
              toolCount: 1,
              tools: expect.arrayContaining([
                expect.objectContaining({
                  name: 'test-tool',
                  description: 'A test tool',
                }),
              ]),
            }),
          }),
        ]),
      );
    });

    it('should discover resources when supported', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        resources: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);
      mockClient.listResources.mockResolvedValue([
        {
          uri: 'file://test.txt',
          name: 'Test Resource',
          description: 'A test resource',
          mimeType: 'text/plain',
        },
      ]);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'resource-discovery',
            status: 'passed',
            details: expect.objectContaining({
              resourceCount: 1,
              resources: expect.arrayContaining([
                expect.objectContaining({
                  uri: 'file://test.txt',
                  name: 'Test Resource',
                }),
              ]),
            }),
          }),
        ]),
      );
    });

    it('should discover prompts when supported', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        prompts: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);
      mockClient.listPrompts.mockResolvedValue([
        {
          name: 'test-prompt',
          description: 'A test prompt',
          arguments: [],
        },
      ]);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'prompt-discovery',
            status: 'passed',
            details: expect.objectContaining({
              promptCount: 1,
              prompts: expect.arrayContaining([
                expect.objectContaining({
                  name: 'test-prompt',
                  description: 'A test prompt',
                }),
              ]),
            }),
          }),
        ]),
      );
    });

    it('should handle discovery errors gracefully', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({
        tools: {},
        resources: {},
        prompts: {},
      });
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);
      mockClient.listTools.mockRejectedValue(new Error('Tools error'));
      mockClient.listResources.mockRejectedValue(new Error('Resources error'));
      mockClient.listPrompts.mockRejectedValue(new Error('Prompts error'));

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'tool-discovery',
            status: 'failed',
            error: expect.objectContaining({
              type: 'ToolDiscoveryError',
            }),
          }),
          expect.objectContaining({
            name: 'resource-discovery',
            status: 'failed',
            error: expect.objectContaining({
              type: 'ResourceDiscoveryError',
            }),
          }),
          expect.objectContaining({
            name: 'prompt-discovery',
            status: 'failed',
            error: expect.objectContaining({
              type: 'PromptDiscoveryError',
            }),
          }),
        ]),
      );
    });

    it('should track execution duration', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);

      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should clean up client connection', async () => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });
      mockClient.ping.mockResolvedValue(undefined);

      await suite.execute(mockContext);

      expect(mockClient.close).toHaveBeenCalled();
    });
  });
});
