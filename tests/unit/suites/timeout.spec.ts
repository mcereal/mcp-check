import { TimeoutTestSuite } from '../../../src/suites/timeout';
import { CheckConfig } from '../../../src/types/config';
import { TestContext } from '../../../src/types/test';

jest.mock('../../../src/core/mcp-client', () => {
  return {
    MCPTestClient: jest.fn().mockImplementation(() => ({
      connectFromTarget: jest.fn().mockResolvedValue(undefined),
      connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
      getServerCapabilities: jest.fn().mockReturnValue({ tools: true }),
      getServerVersion: jest.fn().mockReturnValue({ name: 'mock', version: '1.0.0' }),
      ping: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue([
        { name: 'echo', description: 'Echo tool', inputSchema: { type: 'object' } },
        { name: 'slow_operation', description: 'Slow tool', inputSchema: { type: 'object' } },
      ]),
      listResources: jest.fn().mockResolvedValue([]),
      callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('TimeoutTestSuite', () => {
  const suite = new TimeoutTestSuite();

  describe('metadata', () => {
    it('has correct name and version', () => {
      expect(suite.name).toBe('timeout');
      expect(suite.version).toBe('1.0.0');
    });

    it('has description and tags', () => {
      expect(suite.description).toContain('timeout');
      expect(suite.tags).toContain('resilience');
      expect(suite.tags).toContain('timeout');
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

    it('returns warning when timeouts not configured', () => {
      const result = suite.validate({ target: { type: 'stdio', command: 'node' } });
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('timeout');
    });

    it('returns no warning when timeouts are configured', () => {
      const result = suite.validate({
        target: { type: 'stdio', command: 'node' },
        timeouts: { connectMs: 5000, invokeMs: 10000 },
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
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

      expect(result.name).toBe('timeout');
      expect(result.cases.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns passed status when all tests pass', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      expect(result.status).toBe('passed');
    });

    it('includes connection timeout test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const connectionTest = result.cases.find((c) => c.name === 'connection-timeout-behavior');
      expect(connectionTest).toBeDefined();
      expect(connectionTest!.status).toBe('passed');
    });

    it('includes invocation timeout test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const invocationTest = result.cases.find((c) => c.name === 'invocation-timeout-behavior');
      expect(invocationTest).toBeDefined();
    });

    it('includes concurrent timeout test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const concurrentTest = result.cases.find((c) => c.name === 'concurrent-timeout-handling');
      expect(concurrentTest).toBeDefined();
    });

    it('includes timeout recovery test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const recoveryTest = result.cases.find((c) => c.name === 'timeout-recovery');
      expect(recoveryTest).toBeDefined();
    });

    it('includes progressive timeout test', async () => {
      const context = createMockContext();
      const result = await suite.execute(context);

      const progressiveTest = result.cases.find((c) => c.name === 'progressive-timeout');
      expect(progressiveTest).toBeDefined();
    });

    it('handles no tools available gracefully', async () => {
      jest.resetModules();
      jest.doMock('../../../src/core/mcp-client', () => {
        return {
          MCPTestClient: jest.fn().mockImplementation(() => ({
            connectFromTarget: jest.fn().mockResolvedValue(undefined),
            connectWithCustomTransport: jest.fn().mockResolvedValue(undefined),
            listTools: jest.fn().mockResolvedValue([]),
            close: jest.fn().mockResolvedValue(undefined),
          })),
        };
      });

      const { TimeoutTestSuite: FreshSuite } = require('../../../src/suites/timeout');
      const freshSuite = new FreshSuite();
      const context = createMockContext();
      const result = await freshSuite.execute(context);

      // Should have skipped tests due to no tools
      const skippedTests = result.cases.filter((c: any) => c.status === 'skipped');
      expect(skippedTests.length).toBeGreaterThan(0);
    });
  });
});
