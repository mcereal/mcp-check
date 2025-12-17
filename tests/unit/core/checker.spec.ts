import { MCPChecker } from '../../../src/core/checker';
import { ResolvedCheckConfig } from '../../../src/types/config';
import { TestSuitePlugin, TestContext, TestSuiteResult, ValidationResult } from '../../../src/types/test';
import { Transport, TransportFactory } from '../../../src/types/transport';

// Mock the FileFixtureManager
jest.mock('../../../src/core/fixture-manager', () => ({
  FileFixtureManager: jest.fn().mockImplementation(() => ({
    list: jest.fn().mockResolvedValue([]),
    generate: jest.fn(),
    save: jest.fn(),
    load: jest.fn(),
    cleanup: jest.fn(),
    export: jest.fn(),
  })),
}));

// Mock the logger
jest.mock('../../../src/core/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

describe('MCPChecker', () => {
  const createMockConfig = (): ResolvedCheckConfig => ({
    $schema: './schemas/mcp-check.config.schema.json',
    target: { type: 'stdio', command: 'node', args: ['server.js'] },
    expectations: {
      minProtocolVersion: '1.0.0',
      capabilities: ['tools'],
    },
    suites: ['test-suite'],
    timeouts: {
      connectMs: 5000,
      invokeMs: 10000,
      shutdownMs: 3000,
      streamMs: 30000,
    },
    chaos: { enable: false, seed: 12345 },
    reporting: {
      formats: ['json'],
      outputDir: './reports',
      includeFixtures: true,
      redaction: { enabled: true },
    },
    parallelism: {
      maxConcurrentTests: 1,
      maxConcurrentConnections: 1,
    },
    version: '1.0.0',
    environment: {
      platform: 'darwin',
      nodeVersion: 'v20.0.0',
      architecture: 'arm64',
    },
  });

  const createMockTransport = (): Transport => ({
    type: 'stdio',
    state: 'connected',
    stats: { messagesSent: 0, messagesReceived: 0, bytesTransferred: 0 },
    connect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    waitForMessage: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    setMaxListeners: jest.fn(),
    getMaxListeners: jest.fn(),
    listeners: jest.fn(),
    rawListeners: jest.fn(),
    listenerCount: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn(),
  } as unknown as Transport);

  const createMockTransportFactory = (transport: Transport): TransportFactory => ({
    create: jest.fn().mockReturnValue(transport),
    supports: jest.fn().mockReturnValue(true),
  });

  const createMockSuite = (name: string, result?: Partial<TestSuiteResult>): TestSuitePlugin => ({
    name,
    version: '1.0.0',
    description: `Test suite ${name}`,
    tags: ['test'],
    validate: jest.fn().mockReturnValue({ valid: true }),
    execute: jest.fn().mockResolvedValue({
      name,
      status: 'passed',
      durationMs: 100,
      cases: [
        { name: 'test-case-1', status: 'passed', durationMs: 50 },
        { name: 'test-case-2', status: 'passed', durationMs: 50 },
      ],
      ...result,
    }),
  });

  describe('constructor', () => {
    it('creates checker with config', () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);

      expect(checker).toBeInstanceOf(MCPChecker);
    });

    it('accepts custom logger', () => {
      const config = createMockConfig();
      const customLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
      };

      const checker = new MCPChecker(config, customLogger as any);
      expect(checker).toBeInstanceOf(MCPChecker);
    });
  });

  describe('registerSuite', () => {
    it('registers a test suite', () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const suite = createMockSuite('my-suite');

      checker.registerSuite(suite);

      // No direct way to verify, but run() will use it
    });
  });

  describe('registerSuites', () => {
    it('registers multiple test suites', () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const suite1 = createMockSuite('suite-1');
      const suite2 = createMockSuite('suite-2');

      checker.registerSuites([suite1, suite2]);
    });
  });

  describe('setTransportFactory', () => {
    it('sets transport factory', () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      checker.setTransportFactory(factory);
    });
  });

  describe('setChaosController', () => {
    it('sets chaos controller', () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const chaosController = {
        isEnabled: jest.fn().mockReturnValue(false),
        registerPlugin: jest.fn(),
        processOutgoing: jest.fn(),
        processIncoming: jest.fn(),
        reset: jest.fn(),
        getStats: jest.fn(),
      };

      checker.setChaosController(chaosController as any);
    });
  });

  describe('run', () => {
    it('executes test suites and returns results', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);
      const suite = createMockSuite('test-suite');

      checker.setTransportFactory(factory);
      checker.registerSuite(suite);

      const results = await checker.run();

      expect(results.summary.total).toBe(2);
      expect(results.summary.passed).toBe(2);
      expect(results.summary.failed).toBe(0);
      expect(results.suites).toHaveLength(1);
      expect(results.metadata).toBeDefined();
      expect(results.metadata.mcpCheckVersion).toBe('1.0.0');
    });

    it('emits start and complete events', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);
      const suite = createMockSuite('test-suite');

      checker.setTransportFactory(factory);
      checker.registerSuite(suite);

      const startListener = jest.fn();
      const completeListener = jest.fn();

      checker.on('start', startListener);
      checker.on('complete', completeListener);

      await checker.run();

      expect(startListener).toHaveBeenCalled();
      expect(completeListener).toHaveBeenCalled();
    });

    it('emits suite-start and suite-complete events', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);
      const suite = createMockSuite('test-suite');

      checker.setTransportFactory(factory);
      checker.registerSuite(suite);

      const suiteStartListener = jest.fn();
      const suiteCompleteListener = jest.fn();

      checker.on('suite-start', suiteStartListener);
      checker.on('suite-complete', suiteCompleteListener);

      await checker.run();

      expect(suiteStartListener).toHaveBeenCalledWith({ name: 'test-suite' });
      expect(suiteCompleteListener).toHaveBeenCalled();
    });

    it('throws error when transport factory not set', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const suite = createMockSuite('test-suite');

      checker.registerSuite(suite);

      await expect(checker.run()).rejects.toThrow('Transport factory not set');
    });

    it('throws error when no valid suites found', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      checker.setTransportFactory(factory);
      // No suites registered

      await expect(checker.run()).rejects.toThrow('No valid test suites found');
    });

    it('handles failed suite gracefully', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const failedSuite = createMockSuite('test-suite', {
        status: 'failed',
        cases: [
          { name: 'test-case-1', status: 'failed', durationMs: 50, error: { type: 'TestError', message: 'Failed' } },
        ],
      });

      checker.setTransportFactory(factory);
      checker.registerSuite(failedSuite);

      const results = await checker.run();

      expect(results.summary.failed).toBe(1);
      expect(results.suites[0].status).toBe('failed');
    });

    it('supports fail-fast mode', async () => {
      const config = createMockConfig();
      config.suites = ['suite-1', 'suite-2'];

      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const failingSuite = createMockSuite('suite-1', {
        status: 'failed',
        cases: [{ name: 'test', status: 'failed', durationMs: 10 }],
      });
      const passingSuite = createMockSuite('suite-2');

      checker.setTransportFactory(factory);
      checker.registerSuite(failingSuite);
      checker.registerSuite(passingSuite);

      const results = await checker.run({ failFast: true });

      // Should only have run the first suite
      expect(results.suites).toHaveLength(1);
      expect(results.suites[0].name).toBe('suite-1');
    });

    it('handles validation failure', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const invalidSuite: TestSuitePlugin = {
        name: 'test-suite',
        version: '1.0.0',
        description: 'Invalid suite',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({
          valid: false,
          errors: ['Config error'],
        }),
        execute: jest.fn(),
      };

      checker.setTransportFactory(factory);
      checker.registerSuite(invalidSuite);

      const results = await checker.run();

      expect(results.suites[0].status).toBe('failed');
      expect(invalidSuite.execute).not.toHaveBeenCalled();
    });

    it('calls setup and teardown if provided', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const setup = jest.fn().mockResolvedValue(undefined);
      const teardown = jest.fn().mockResolvedValue(undefined);

      const suiteWithHooks: TestSuitePlugin = {
        name: 'test-suite',
        version: '1.0.0',
        description: 'Suite with hooks',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        setup,
        teardown,
        execute: jest.fn().mockResolvedValue({
          name: 'test-suite',
          status: 'passed',
          durationMs: 100,
          cases: [],
        }),
      };

      checker.setTransportFactory(factory);
      checker.registerSuite(suiteWithHooks);

      await checker.run();

      expect(setup).toHaveBeenCalled();
      expect(teardown).toHaveBeenCalled();
    });

    it('filters suites by tags', async () => {
      const config = createMockConfig();
      config.suites = ['suite-1', 'suite-2'];

      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const suite1: TestSuitePlugin = {
        ...createMockSuite('suite-1'),
        tags: ['performance'],
      };
      const suite2: TestSuitePlugin = {
        ...createMockSuite('suite-2'),
        tags: ['functional'],
      };

      checker.setTransportFactory(factory);
      checker.registerSuite(suite1);
      checker.registerSuite(suite2);

      const results = await checker.run({ tags: ['performance'] });

      expect(results.suites).toHaveLength(1);
      expect(results.suites[0].name).toBe('suite-1');
    });

    it('excludes suites by tags', async () => {
      const config = createMockConfig();
      config.suites = ['suite-1', 'suite-2'];

      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const suite1: TestSuitePlugin = {
        ...createMockSuite('suite-1'),
        tags: ['performance'],
      };
      const suite2: TestSuitePlugin = {
        ...createMockSuite('suite-2'),
        tags: ['functional'],
      };

      checker.setTransportFactory(factory);
      checker.registerSuite(suite1);
      checker.registerSuite(suite2);

      const results = await checker.run({ excludeTags: ['performance'] });

      expect(results.suites).toHaveLength(1);
      expect(results.suites[0].name).toBe('suite-2');
    });

    it('handles transport close errors gracefully', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      (transport.close as jest.Mock).mockRejectedValueOnce(new Error('Close failed'));

      const factory = createMockTransportFactory(transport);
      const suite = createMockSuite('test-suite');

      checker.setTransportFactory(factory);
      checker.registerSuite(suite);

      // Should not throw
      const results = await checker.run();
      expect(results.summary.passed).toBe(2);
    });

    it('counts different test statuses correctly', async () => {
      const config = createMockConfig();
      const checker = new MCPChecker(config);
      const transport = createMockTransport();
      const factory = createMockTransportFactory(transport);

      const mixedSuite = createMockSuite('test-suite', {
        cases: [
          { name: 'passed-test', status: 'passed', durationMs: 10 },
          { name: 'failed-test', status: 'failed', durationMs: 10 },
          { name: 'skipped-test', status: 'skipped', durationMs: 0 },
          { name: 'warning-test', status: 'warning', durationMs: 10 },
        ],
      });

      checker.setTransportFactory(factory);
      checker.registerSuite(mixedSuite);

      const results = await checker.run();

      expect(results.summary.total).toBe(4);
      expect(results.summary.passed).toBe(1);
      expect(results.summary.failed).toBe(1);
      expect(results.summary.skipped).toBe(1);
      expect(results.summary.warnings).toBe(1);
    });
  });
});
