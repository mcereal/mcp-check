/**
 * Unit tests for ToolInvocationTestSuite
 */

import { ToolInvocationTestSuite } from '../../../src/suites/tool-invocation';
import { TestContext } from '../../../src/types/test';
import { ResolvedCheckConfig } from '../../../src/types/config';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { MCPTestClient } from '../../../src/core/mcp-client';
import {
  MCPTool,
  MCPCallToolResult,
  MCPTextContent,
} from '../../../src/types/mcp';
import { EventEmitter } from 'events';

// Mock the MCPTestClient
jest.mock('../../../src/core/mcp-client');

describe('ToolInvocationTestSuite', () => {
  let suite: ToolInvocationTestSuite;
  let mockContext: TestContext;
  let mockConfig: ResolvedCheckConfig;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<Transport> & EventEmitter;
  let mockClient: jest.Mocked<MCPTestClient>;

  const mockTools: MCPTool[] = [
    {
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          input: { type: 'string' },
        },
        required: ['input'],
      },
    },
    {
      name: 'math-tool',
      description: 'A math calculation tool',
      inputSchema: {
        type: 'object' as const,
        properties: {
          operation: { type: 'string', enum: ['add', 'subtract'] },
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['operation', 'a', 'b'],
      },
    },
  ];

  const mockToolResult: MCPCallToolResult = {
    content: [
      {
        type: 'text',
        text: 'Tool execution successful',
      } as MCPTextContent,
    ],
  };

  beforeEach(() => {
    suite = new ToolInvocationTestSuite();

    mockConfig = {
      $schema: 'https://example.com/schema',
      target: {
        type: 'stdio',
        command: 'node',
        args: ['test-server.js'],
      },
      suites: ['tool-invocation'],
      expectations: {
        minProtocolVersion: '2024-11-05',
        capabilities: ['tools'],
        tools: [
          {
            name: 'test-tool',
            required: true,
            description: 'Expected test tool',
          },
        ],
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
      expect(suite.name).toBe('tool-invocation');
      expect(suite.version).toBe('1.0.0');
      expect(suite.description).toContain('tool execution');
      expect(suite.tags).toContain('tools');
      expect(suite.tags).toContain('execution');
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
          capabilities: ['tools'],
          tools: [
            {
              name: 'test-tool',
            },
          ],
        },
      };

      const result = suite.validate(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should warn when no tools are configured', () => {
      const config = {
        target: {
          type: 'stdio' as const,
          command: 'node',
          args: ['test.js'],
        },
        expectations: {
          tools: [],
        },
      };

      const result = suite.validate(config);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'No tools configured for testing - invocation tests will be limited',
      );
    });

    it('should reject configuration without target', () => {
      const config = {
        expectations: {
          tools: [{ name: 'test-tool' }],
        },
      };

      const result = suite.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target configuration is required');
    });
  });

  describe('Test Execution', () => {
    beforeEach(() => {
      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue(mockToolResult);
    });

    it('should successfully execute tool invocation tests', async () => {
      const result = await suite.execute(mockContext);

      expect(result.name).toBe('tool-invocation');
      expect(result.status).toBe('passed');
      expect(result.cases.length).toBeGreaterThan(0);
      expect(mockClient.connectWithCustomTransport).toHaveBeenCalledWith(
        mockTransport,
      );
      expect(mockClient.listTools).toHaveBeenCalled();
    });

    it('should handle connection failures', async () => {
      mockClient.connectWithCustomTransport.mockRejectedValue(
        new Error('Connection failed'),
      );

      const result = await suite.execute(mockContext);

      expect(result.status).toBe('failed');
      expect(
        result.cases.some(
          (c) => c.name === 'initialization' && c.status === 'failed',
        ),
      ).toBe(true);
    });

    it('should test tool availability for expected tools', async () => {
      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'test-tool',
        expect.any(Object),
      );

      const testCases = result.cases.filter((c) =>
        c.name.includes('test-tool'),
      );
      expect(testCases.length).toBeGreaterThan(0);
    });

    it('should handle missing required tools', async () => {
      // Return tools without the expected one
      mockClient.listTools.mockResolvedValue([
        {
          name: 'other-tool',
          description: 'A different tool',
          inputSchema: { type: 'object' as const },
        },
      ]);

      const result = await suite.execute(mockContext);

      const availabilityTest = result.cases.find(
        (c) => c.name.includes('test-tool') && c.name.includes('availability'),
      );
      expect(availabilityTest?.status).toBe('failed');
    });

    it('should test basic tool invocation', async () => {
      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalled();
      const basicInvocationTest = result.cases.find(
        (c) => c.name.includes('test-tool') && c.name.includes('basic'),
      );
      expect(basicInvocationTest).toBeDefined();
    });

    it('should handle tool invocation errors', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Tool execution failed'));

      const result = await suite.execute(mockContext);

      const failedTest = result.cases.find(
        (c) => c.name.includes('test-tool') && c.status === 'failed',
      );
      expect(failedTest).toBeDefined();
      expect(failedTest?.error?.message).toContain('Tool execution failed');
    });

    it('should test tools with no available tools', async () => {
      mockClient.listTools.mockResolvedValue([]);

      const result = await suite.execute(mockContext);

      const skipTest = result.cases.find(
        (c) => c.name === 'tool-availability' && c.status === 'skipped',
      );
      expect(skipTest).toBeDefined();
    });

    it('should test multiple tools when available', async () => {
      const result = await suite.execute(mockContext);

      // Should test both tools in mockTools
      const testToolCases = result.cases.filter((c) =>
        c.name.includes('test-tool'),
      );
      const mathToolCases = result.cases.filter((c) =>
        c.name.includes('math-tool'),
      );

      expect(testToolCases.length).toBeGreaterThan(0);
      expect(mathToolCases.length).toBeGreaterThan(0);
    });

    it('should test timeout scenarios', async () => {
      mockContext.config.timeouts.invokeMs = 1;

      mockClient.callTool.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockToolResult), 100),
          ),
      );

      const result = await suite.execute(mockContext);

      const timeoutTest = result.cases.find(
        (c) => c.name.includes('timeout') && c.status === 'failed',
      );
      expect(timeoutTest).toBeDefined();
    });

    it('should test error handling scenarios', async () => {
      const result = await suite.execute(mockContext);

      const errorHandlingTests = result.cases.filter(
        (c) => c.name.includes('error') || c.name.includes('invalid'),
      );
      expect(errorHandlingTests.length).toBeGreaterThan(0);
    });

    it('should cleanup on test completion', async () => {
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

  describe('Dynamic Test Generation', () => {
    beforeEach(() => {
      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue(mockToolResult);
    });

    it('should generate basic input for tools with simple schemas', async () => {
      const result = await suite.execute(mockContext);

      // Should generate tests for tools with different schema types
      expect(mockClient.callTool).toHaveBeenCalledWith(
        'test-tool',
        expect.any(Object),
      );
      expect(mockClient.callTool).toHaveBeenCalledWith(
        'math-tool',
        expect.any(Object),
      );
    });

    it('should handle tools with complex input schemas', async () => {
      const complexTool: MCPTool = {
        name: 'complex-tool',
        description: 'Tool with complex schema',
        inputSchema: {
          type: 'object' as const,
          properties: {
            nested: {
              type: 'object',
              properties: {
                value: { type: 'string' },
              },
            },
            array: {
              type: 'array',
              items: { type: 'number' },
            },
          },
          required: ['nested'],
        },
      };

      mockClient.listTools.mockResolvedValue([complexTool]);

      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'complex-tool',
        expect.any(Object),
      );
    });

    it('should handle tools with optional properties', async () => {
      const optionalTool: MCPTool = {
        name: 'optional-tool',
        description: 'Tool with optional properties',
        inputSchema: {
          type: 'object' as const,
          properties: {
            required_field: { type: 'string' },
            optional_field: { type: 'number' },
          },
          required: ['required_field'],
        },
      };

      mockClient.listTools.mockResolvedValue([optionalTool]);

      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'optional-tool',
        expect.any(Object),
      );
    });

    it('should handle tools with enum constraints', async () => {
      const enumTool: MCPTool = {
        name: 'enum-tool',
        description: 'Tool with enum constraints',
        inputSchema: {
          type: 'object' as const,
          properties: {
            operation: {
              type: 'string',
              enum: ['create', 'update', 'delete'],
            },
          },
          required: ['operation'],
        },
      };

      mockClient.listTools.mockResolvedValue([enumTool]);

      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'enum-tool',
        expect.any(Object),
      );
    });
  });

  describe('Response Handling', () => {
    beforeEach(() => {
      mockClient.listTools.mockResolvedValue(mockTools);
    });

    it('should handle successful tool responses', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'Tool execution successful',
          } as MCPTextContent,
        ],
      });

      const result = await suite.execute(mockContext);

      const successfulTest = result.cases.find(
        (c) => c.name.includes('test-tool') && c.status === 'passed',
      );
      expect(successfulTest).toBeDefined();
    });

    it('should handle tool responses with multiple content blocks', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'First part',
          } as MCPTextContent,
          {
            type: 'text',
            text: 'Second part',
          } as MCPTextContent,
        ],
      });

      const result = await suite.execute(mockContext);

      expect(result.cases.some((c) => c.status === 'passed')).toBe(true);
    });

    it('should handle empty tool responses', async () => {
      mockClient.callTool.mockResolvedValue({
        content: [],
      });

      const result = await suite.execute(mockContext);

      // Empty responses might be valid depending on the tool
      expect(result.cases.length).toBeGreaterThan(0);
    });

    it('should handle null tool responses', async () => {
      mockClient.callTool.mockResolvedValue(null as any);

      const result = await suite.execute(mockContext);

      const failedTest = result.cases.find(
        (c) => c.name.includes('test-tool') && c.status === 'failed',
      );
      expect(failedTest).toBeDefined();
    });

    it('should handle malformed tool responses', async () => {
      mockClient.callTool.mockResolvedValue({
        content: 'not-an-array',
      } as any);

      const result = await suite.execute(mockContext);

      const failedTest = result.cases.find(
        (c) => c.name.includes('test-tool') && c.status === 'failed',
      );
      expect(failedTest).toBeDefined();
    });
  });

  describe('Performance and Timing', () => {
    beforeEach(() => {
      mockClient.listTools.mockResolvedValue(mockTools);
      mockClient.callTool.mockResolvedValue(mockToolResult);
    });

    it('should track test execution time', async () => {
      const result = await suite.execute(mockContext);

      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.setup?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track individual test case durations', async () => {
      const result = await suite.execute(mockContext);

      result.cases.forEach((testCase) => {
        expect(testCase.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle timeout scenarios', async () => {
      mockContext.config.timeouts.invokeMs = 1;

      mockClient.callTool.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockToolResult), 100),
          ),
      );

      const result = await suite.execute(mockContext);

      const testCase = result.cases.find((c) => c.name.includes('test-tool'));
      expect(testCase?.status).toBe('failed');
      expect(testCase?.error).toContain('timeout');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockClient.listTools.mockResolvedValue(mockTools);
    });

    it('should handle tools with no expectations configured', async () => {
      delete mockContext.config.expectations.tools;

      const result = await suite.execute(mockContext);

      // Should still test discovered tools
      expect(result.cases.length).toBeGreaterThan(0);
    });

    it('should handle large tool argument generation', async () => {
      const largeTool: MCPTool = {
        name: 'large-tool',
        description: 'Tool with many parameters',
        inputSchema: {
          type: 'object' as const,
          properties: Object.fromEntries(
            Array.from({ length: 100 }, (_, i) => [
              `param${i}`,
              { type: 'string' },
            ]),
          ),
        },
      };

      mockClient.listTools.mockResolvedValue([largeTool]);

      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'large-tool',
        expect.any(Object),
      );
    });

    it('should handle tools with deeply nested schemas', async () => {
      const nestedTool: MCPTool = {
        name: 'nested-tool',
        description: 'Tool with nested schema',
        inputSchema: {
          type: 'object' as const,
          properties: {
            level1: {
              type: 'object',
              properties: {
                level2: {
                  type: 'object',
                  properties: {
                    level3: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      mockClient.listTools.mockResolvedValue([nestedTool]);

      const result = await suite.execute(mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith(
        'nested-tool',
        expect.any(Object),
      );
    });

    it('should handle tools with invalid schemas', async () => {
      const invalidTool: any = {
        name: 'invalid-tool',
        description: 'Tool with invalid schema',
        inputSchema: 'not-a-schema',
      };

      mockClient.listTools.mockResolvedValue([invalidTool]);

      const result = await suite.execute(mockContext);

      // Should handle gracefully
      expect(result.cases.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      mockClient.listTools.mockResolvedValue(mockTools);
    });

    it('should continue testing after individual tool failures', async () => {
      mockClient.callTool.mockImplementation((toolName) => {
        if (toolName === 'test-tool') {
          return Promise.reject(new Error('First tool failed'));
        }
        return Promise.resolve(mockToolResult);
      });

      const result = await suite.execute(mockContext);

      // Should have multiple test cases, some passed, some failed
      expect(result.cases.length).toBeGreaterThan(1);
      expect(result.cases.some((c) => c.status === 'passed')).toBe(true);
      expect(result.cases.some((c) => c.status === 'failed')).toBe(true);
    });

    it('should continue testing after connection failures during execution', async () => {
      let callCount = 0;
      mockClient.callTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Connection lost'));
        }
        return Promise.resolve(mockToolResult);
      });

      const result = await suite.execute(mockContext);

      expect(result.cases.length).toBeGreaterThan(1);
    });

    it('should handle partial failures gracefully', async () => {
      mockClient.callTool.mockImplementation((toolName, args) => {
        // Fail some invocations but not others
        if (JSON.stringify(args).includes('fail')) {
          return Promise.reject(new Error('Intentional failure'));
        }
        return Promise.resolve(mockToolResult);
      });

      const result = await suite.execute(mockContext);

      // Should continue testing despite some failures
      expect(result.status).toBe('passed');
    });
  });
});
