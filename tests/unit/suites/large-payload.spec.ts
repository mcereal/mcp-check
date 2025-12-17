import { LargePayloadTestSuite } from '../../../src/suites/large-payload';
import { CheckConfig } from '../../../src/types/config';
import { TestContext } from '../../../src/types/test';

jest.mock('../../../src/core/mcp-client', () => {
  return {
    MCPTestClient: jest.fn().mockImplementation(() => ({
      connectFromTarget: jest.fn().mockResolvedValue(undefined),
      connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
      getServerCapabilities: jest.fn().mockReturnValue({ tools: true, resources: true }),
      getServerVersion: jest.fn().mockReturnValue({ name: 'mock', version: '1.0.0' }),
      ping: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue([
        {
          name: 'echo',
          description: 'Echo tool',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
        {
          name: 'process_data',
          description: 'Process data tool',
          inputSchema: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object' } },
            },
          },
        },
        {
          name: 'large_payload',
          description: 'Returns large payload',
          inputSchema: { type: 'object' },
        },
      ]),
      listResources: jest.fn().mockResolvedValue([
        { uri: 'test://docs/readme', name: 'README' },
        { uri: 'test://docs/api', name: 'API Docs' },
      ]),
      callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
      readResource: jest.fn().mockResolvedValue({
        contents: [{ uri: 'test://docs/readme', text: 'Sample content' }],
      }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('LargePayloadTestSuite', () => {
  const suite = new LargePayloadTestSuite();

  describe('metadata', () => {
    it('has correct name and version', () => {
      expect(suite.name).toBe('large-payload');
      expect(suite.version).toBe('1.0.0');
    });

    it('has description and tags', () => {
      expect(suite.description).toContain('large payload');
      expect(suite.tags).toContain('resilience');
      expect(suite.tags).toContain('performance');
      expect(suite.tags).toContain('stress');
    });
  });

  describe('validate', () => {
    it('returns invalid when target is missing', () => {
      const result = suite.validate({} as Partial<CheckConfig>);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target configuration is required');
    });

    it('returns valid with target configuration', () => {
      const result = suite.validate({ target: { type: 'stdio', command: 'node' } });
      expect(result.valid).toBe(true);
    });
  });

  describe('execute', () => {
    const createMockContext = (): TestContext => {
      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      };

      return {
        config: {
          target: { type: 'stdio', command: 'node' },
          timeouts: {
            connectMs: 5000,
            invokeMs: 10000,
            shutdownMs: 3000,
          },
        },
        logger,
        transport: {
          type: 'stdio',
          state: 'disconnected',
          stats: { messagesSent: 0, messagesReceived: 0, bytesTransferred: 0 },
        },
      } as unknown as TestContext;
    };

    it('executes all test cases', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      expect(result.name).toBe('large-payload');
      expect(result.cases.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns passed status when all tests pass', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      expect(result.status).toBe('passed');
    });

    it('includes large input payload test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const inputTest = result.cases.find((c) => c.name === 'large-input-payload');
      expect(inputTest).toBeDefined();
    });

    it('includes large output payload test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const outputTest = result.cases.find((c) => c.name === 'large-output-payload');
      expect(outputTest).toBeDefined();
      expect(outputTest!.status).toBe('passed');
    });

    it('includes large JSON structure test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const jsonTest = result.cases.find((c) => c.name === 'large-json-structure');
      expect(jsonTest).toBeDefined();
    });

    it('includes memory stability test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const memoryTest = result.cases.find((c) => c.name === 'memory-stability');
      expect(memoryTest).toBeDefined();
    });

    it('includes resource content size test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const resourceTest = result.cases.find((c) => c.name === 'resource-content-size');
      expect(resourceTest).toBeDefined();
    });

    it('handles no tools available gracefully', async () => {
      jest.resetModules();
      jest.doMock('../../../src/core/mcp-client', () => {
        return {
          MCPTestClient: jest.fn().mockImplementation(() => ({
            connectFromTarget: jest.fn().mockResolvedValue(undefined),
            connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue([]),
            listResources: jest.fn().mockResolvedValue([]),
            close: jest.fn().mockResolvedValue(undefined),
          })),
        };
      });

      const { LargePayloadTestSuite: FreshSuite } = require('../../../src/suites/large-payload');
      const freshSuite = new FreshSuite();
      const context = createMockContext();
      const result = await freshSuite.execute(context);

      // Should have skipped tests due to no tools/resources
      const skippedTests = result.cases.filter((c: any) => c.status === 'skipped');
      expect(skippedTests.length).toBeGreaterThan(0);
    });

    it('handles no resources available gracefully', async () => {
      jest.resetModules();
      jest.doMock('../../../src/core/mcp-client', () => {
        return {
          MCPTestClient: jest.fn().mockImplementation(() => ({
            connectFromTarget: jest.fn().mockResolvedValue(undefined),
            connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue([
              { name: 'echo', inputSchema: { type: 'object', properties: { msg: { type: 'string' } } } },
            ]),
            listResources: jest.fn().mockRejectedValue(new Error('Resources not supported')),
            callTool: jest.fn().mockResolvedValue({ content: [] }),
            close: jest.fn().mockResolvedValue(undefined),
          })),
        };
      });

      const { LargePayloadTestSuite: FreshSuite } = require('../../../src/suites/large-payload');
      const freshSuite = new FreshSuite();
      const context = createMockContext();
      const result = await freshSuite.execute(context);

      const resourceTest = result.cases.find((c: any) => c.name === 'resource-content-size');
      expect(resourceTest).toBeDefined();
      expect(resourceTest!.status).toBe('skipped');
    });
  });
});
