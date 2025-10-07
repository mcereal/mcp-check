/**
 * Comprehensive unit tests for ToolInvocationTestSuite
 */

import { ToolInvocationTestSuite } from '../../../src/suites/tool-invocation';
import { MCPTestClient } from '../../../src/core/mcp-client';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { TestContext } from '../../../src/types/test';

// Mock the dependencies
jest.mock('../../../src/core/mcp-client');

describe('ToolInvocationTestSuite', () => {
  let suite: ToolInvocationTestSuite;
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
      getServerCapabilities: jest.fn(),
      getServerVersion: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;

    mockTransport = {
      type: 'stdio' as const,
      state: 'connected' as const,
      stats: { messagesSent: 0, messagesReceived: 0, errorsCount: 0 },
      connect: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      waitForMessage: jest.fn(),
    } as any;

    mockContext = {
      client: mockClient,
      transport: mockTransport,
      logger: mockLogger,
      config: {
        $schema: 'test',
        target: { type: 'stdio', command: 'test' },
        suites: ['tool-invocation'],
        chaos: { enable: false },
        reporting: { formats: [], outputDir: './reports' },
        parallelism: { max: 1 },
        expectations: {
          tools: [
            {
              name: 'test-tool',
              required: true,
              inputSchemaRef: 'test-schema',
              description: 'A test tool for validation',
            },
            {
              name: 'optional-tool',
              required: false,
            },
          ],
        },
      },
      fixtures: {
        generate: jest.fn(),
        save: jest.fn(),
        load: jest.fn(),
        list: jest.fn(),
      },
    } as any;

    (
      MCPTestClient as jest.MockedClass<typeof MCPTestClient>
    ).mockImplementation(() => mockClient);

    suite = new ToolInvocationTestSuite();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Suite Properties', () => {
    it('should have correct metadata', () => {
      expect(suite.name).toBe('tool-invocation');
      expect(suite.version).toBe('1.0.0');
      expect(suite.description).toContain('tool execution');
      expect(suite.tags).toContain('core');
      expect(suite.tags).toContain('tools');
      expect(suite.tags).toContain('execution');
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

    it('should reject configuration without target', () => {
      const config = {};

      const result = suite.validate(config as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Target configuration is required');
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
          w.includes('tool invocation tests may be limited'),
        ),
      ).toBe(true);
    });
  });

  describe('Tool Invocation Tests', () => {
    beforeEach(() => {
      mockClient.connectFromTarget.mockResolvedValue(undefined);
      mockClient.getServerCapabilities.mockReturnValue({});
      mockClient.getServerVersion.mockReturnValue({});
    });

    it('should successfully execute tool invocation tests', async () => {
      const mockTools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              count: { type: 'number', minimum: 1 },
            },
            required: ['message'],
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Tool executed successfully' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.name).toBe('tool-invocation');
      expect(result.cases.length).toBeGreaterThan(0);
      expect(mockClient.listTools).toHaveBeenCalled();
      expect(mockClient.callTool).toHaveBeenCalled();
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
      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'initialization',
            status: 'failed',
            error: expect.objectContaining({
              type: 'InitializationError',
            }),
          }),
        ]),
      );
    });

    it('should fallback to custom transport when SDK fails', async () => {
      mockClient.connectFromTarget.mockRejectedValue(new Error('SDK failed'));
      mockClient.connectWithCustomTransport.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue([]);

      const result = await suite.execute(mockContext);

      expect(mockClient.connectWithCustomTransport).toHaveBeenCalledWith(
        mockTransport,
      );
    });

    it('should test required tools', async () => {
      const mockTools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/test-tool.*basic-invocation/),
            status: 'passed',
          }),
        ]),
      );
    });

    it('should test unexpected tools (not in expectations)', async () => {
      const mockTools = [
        {
          name: 'unexpected-tool',
          description: 'An unexpected tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/unexpected-tool.*basic-invocation/),
          }),
        ]),
      );
    });

    it('should handle tool invocation errors', async () => {
      const mockTools = [
        {
          name: 'failing-tool',
          description: 'A tool that fails',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockRejectedValue(new Error('Tool execution failed'));

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/failing-tool.*basic-invocation/),
            status: 'failed',
            error: expect.objectContaining({
              message: expect.stringContaining('Tool execution failed'),
            }),
          }),
        ]),
      );
    });

    it('should test input validation with invalid inputs', async () => {
      const mockTools = [
        {
          name: 'validation-tool',
          description: 'A tool with strict validation',
          inputSchema: {
            type: 'object',
            properties: {
              requiredField: { type: 'string' },
              numberField: { type: 'number', minimum: 0 },
            },
            required: ['requiredField'],
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Valid input success' }],
        })
        .mockRejectedValueOnce(new Error('Invalid input'));

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/validation-tool.*invalid-input/),
          }),
        ]),
      );
    });

    it('should test timeout scenarios', async () => {
      const mockTools = [
        {
          name: 'timeout-tool',
          description: 'A tool that times out',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);

      // Mock a timeout by making the call hang
      mockClient.callTool.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 100),
          ),
      );

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'timeout-handling',
            status: 'failed',
            error: expect.objectContaining({
              type: 'TimeoutError',
            }),
          }),
        ]),
      );
    });

    it('should test error handling with non-existent tools', async () => {
      mockClient.listTools.mockResolvedValue([]);
      mockClient.callTool.mockRejectedValue(new Error('Tool not found'));

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'error-handling-nonexistent-tool',
            status: 'failed',
            error: expect.objectContaining({
              type: 'ErrorTestError',
            }),
          }),
        ]),
      );
    });

    it('should test deterministic behavior with same inputs', async () => {
      const mockTools = [
        {
          name: 'deterministic-tool',
          description: 'A deterministic tool',
          inputSchema: {
            type: 'object',
            properties: {
              seed: { type: 'number' },
            },
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Deterministic result' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/deterministic-tool.*deterministic/),
          }),
        ]),
      );

      // Should be called at least twice for deterministic testing
      expect(mockClient.callTool).toHaveBeenCalledTimes(
        expect.objectContaining({
          asymmetricMatch: (actual: number) => actual >= 2,
        }),
      );
    });

    it('should handle tools with complex input schemas', async () => {
      const mockTools = [
        {
          name: 'complex-tool',
          description: 'A tool with complex schema',
          inputSchema: {
            type: 'object',
            properties: {
              config: {
                type: 'object',
                properties: {
                  mode: { type: 'string', enum: ['fast', 'slow'] },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
              metadata: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Complex tool success' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/complex-tool.*basic-invocation/),
            status: 'passed',
          }),
        ]),
      );
    });

    it('should track execution duration', async () => {
      mockClient.listTools.mockResolvedValue([]);

      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should clean up client connection', async () => {
      mockClient.listTools.mockResolvedValue([]);

      await suite.execute(mockContext);

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should determine overall status correctly', async () => {
      const mockTools = [
        {
          name: 'passing-tool',
          description: 'A tool that passes',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'failing-tool',
          description: 'A tool that fails',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Success' }],
        })
        .mockRejectedValueOnce(new Error('Failure'));

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed'); // Should be failed due to one failure
    });

    it('should handle missing required tools', async () => {
      // Return tools that don't include the required 'test-tool'
      mockClient.listTools.mockResolvedValue([
        {
          name: 'other-tool',
          description: 'A different tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ]);

      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });

      const result = await suite.execute(mockContext);

      // Should still execute available tools but may have warnings about missing required tools
      expect(result.cases.length).toBeGreaterThan(0);
    });
  });

  describe('Input Generation', () => {
    it('should generate appropriate inputs for different schema types', async () => {
      const mockTools = [
        {
          name: 'string-tool',
          description: 'Tool with string input',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string', minLength: 1 },
            },
            required: ['text'],
          },
        },
        {
          name: 'number-tool',
          description: 'Tool with number input',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'number', minimum: 0, maximum: 100 },
            },
            required: ['value'],
          },
        },
        {
          name: 'boolean-tool',
          description: 'Tool with boolean input',
          inputSchema: {
            type: 'object',
            properties: {
              flag: { type: 'boolean' },
            },
            required: ['flag'],
          },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });

      const result = await suite.execute(mockContext);

      // Verify that tools were called with appropriate arguments
      expect(mockClient.callTool).toHaveBeenCalledWith(
        'string-tool',
        expect.objectContaining({
          text: expect.any(String),
        }),
      );

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'number-tool',
        expect.objectContaining({
          value: expect.any(Number),
        }),
      );

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'boolean-tool',
        expect.objectContaining({
          flag: expect.any(Boolean),
        }),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle tools with no input schema', async () => {
      const mockTools = [
        {
          name: 'no-schema-tool',
          description: 'Tool without input schema',
          // No inputSchema property
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools as any);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/no-schema-tool/),
          }),
        ]),
      );
    });

    it('should handle tools with empty input schema', async () => {
      const mockTools = [
        {
          name: 'empty-schema-tool',
          description: 'Tool with empty schema',
          inputSchema: {},
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/empty-schema-tool/),
            status: 'passed',
          }),
        ]),
      );
    });

    it('should handle malformed tool responses', async () => {
      const mockTools = [
        {
          name: 'malformed-tool',
          description: 'Tool with malformed response',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue({
        // Malformed response - missing content
        malformed: true,
      } as any);

      const result = await suite.execute(mockContext);

      expect(result.cases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.stringMatching(/malformed-tool/),
          }),
        ]),
      );
    });
  });
});
