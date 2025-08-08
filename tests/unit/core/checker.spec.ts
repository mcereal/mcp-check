/**
 * Unit tests for MCPChecker
 */

import { MCPChecker } from '../../../src/core/checker';
import { ResolvedCheckConfig } from '../../../src/types/config';
import {
  TestSuitePlugin,
  TestContext,
  TestResults,
  TestSuiteResult,
} from '../../../src/types/test';
import { TransportFactory, Transport } from '../../../src/types/transport';
import { ChaosController } from '../../../src/types/chaos';
import { Logger } from '../../../src/types/reporting';
import { EventEmitter } from 'events';

describe('MCPChecker', () => {
  let checker: MCPChecker;
  let mockConfig: ResolvedCheckConfig;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransportFactory: jest.Mocked<TransportFactory>;
  let mockTransport: jest.Mocked<Transport> & EventEmitter;
  let mockChaosController: jest.Mocked<ChaosController>;

  beforeEach(() => {
    mockConfig = {
      $schema: 'https://example.com/schema',
      target: {
        type: 'stdio',
        command: 'node',
        args: ['test-server.js'],
      },
      suites: ['handshake', 'tools'],
      expectations: {
        minProtocolVersion: '2024-11-05',
        capabilities: ['tools'],
      },
      timeouts: {
        connectMs: 5000,
        invokeMs: 10000,
        shutdownMs: 3000,
      },
      chaos: {
        enable: false,
        seed: 42,
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
        connectionTime: 0,
      },
    });
    mockTransport.connect = jest.fn().mockResolvedValue(undefined);
    mockTransport.send = jest.fn().mockResolvedValue(undefined);
    mockTransport.close = jest.fn().mockResolvedValue(undefined);
    mockTransport.waitForMessage = jest.fn();

    mockTransportFactory = {
      create: jest.fn().mockResolvedValue(mockTransport),
      supports: jest.fn().mockReturnValue(true),
    };

    mockChaosController = {
      isActive: jest.fn().mockReturnValue(false),
      applyToChaos: jest.fn().mockImplementation((_, callback) => callback()),
      reset: jest.fn(),
      getStrategy: jest.fn(),
      setStrategy: jest.fn(),
    } as any;

    checker = new MCPChecker(mockConfig, mockLogger);
    checker.setTransportFactory(mockTransportFactory);
    checker.setChaosController(mockChaosController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with config and logger', () => {
      expect(checker).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Registered test suite'),
      );
    });

    it('should create default logger if none provided', () => {
      const checkerWithoutLogger = new MCPChecker(mockConfig);
      expect(checkerWithoutLogger).toBeDefined();
    });
  });

  describe('Suite Registration', () => {
    it('should register individual test suites', () => {
      const mockSuite: TestSuitePlugin = {
        name: 'test-suite',
        version: '1.0.0',
        description: 'A test suite',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'test-suite',
          status: 'passed',
          durationMs: 100,
          cases: [],
        }),
      };

      checker.registerSuite(mockSuite);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Registered test suite: test-suite',
      );
    });

    it('should register multiple test suites', () => {
      const mockSuites: TestSuitePlugin[] = [
        {
          name: 'suite1',
          version: '1.0.0',
          description: 'Suite 1',
          tags: ['test'],
          validate: jest.fn().mockReturnValue({ valid: true }),
          execute: jest.fn().mockResolvedValue({
            name: 'suite1',
            status: 'passed',
            durationMs: 100,
            cases: [],
          }),
        },
        {
          name: 'suite2',
          version: '1.0.0',
          description: 'Suite 2',
          tags: ['test'],
          validate: jest.fn().mockReturnValue({ valid: true }),
          execute: jest.fn().mockResolvedValue({
            name: 'suite2',
            status: 'passed',
            durationMs: 100,
            cases: [],
          }),
        },
      ];

      checker.registerSuites(mockSuites);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Registered test suite: suite1',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Registered test suite: suite2',
      );
    });
  });

  describe('Transport and Chaos Controllers', () => {
    it('should set transport factory', () => {
      const newFactory: TransportFactory = {
        create: jest.fn().mockResolvedValue(mockTransport),
        supports: jest.fn().mockReturnValue(true),
      };

      checker.setTransportFactory(newFactory);
      // No direct way to verify this, but it should not throw
      expect(() => checker.setTransportFactory(newFactory)).not.toThrow();
    });

    it('should set chaos controller', () => {
      const newController: ChaosController = {
        isActive: jest.fn().mockReturnValue(true),
        applyToChaos: jest.fn(),
        reset: jest.fn(),
        getStrategy: jest.fn(),
        setStrategy: jest.fn(),
      } as any;

      checker.setChaosController(newController);
      // No direct way to verify this, but it should not throw
      expect(() => checker.setChaosController(newController)).not.toThrow();
    });
  });

  describe('Test Execution', () => {
    let mockSuite: jest.Mocked<TestSuitePlugin>;

    beforeEach(() => {
      mockSuite = {
        name: 'test-suite',
        version: '1.0.0',
        description: 'A test suite',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'test-suite',
          status: 'passed',
          durationMs: 100,
          cases: [
            {
              name: 'test-case-1',
              status: 'passed',
              durationMs: 50,
            },
            {
              name: 'test-case-2',
              status: 'passed',
              durationMs: 50,
            },
          ],
        }),
      };

      checker.registerSuite(mockSuite);
    });

    it('should execute all configured test suites', async () => {
      const results = await checker.run();

      expect(results).toBeDefined();
      expect(results.summary.total).toBe(2);
      expect(results.summary.passed).toBe(2);
      expect(results.summary.failed).toBe(0);
      expect(results.summary.skipped).toBe(0);
      expect(results.metadata).toBeDefined();
      expect(results.metadata!.mcpCheckVersion).toBe('1.0.0');
    });

    it('should emit events during execution', async () => {
      const startSpy = jest.fn();
      const suiteStartSpy = jest.fn();
      const suiteCompleteSpy = jest.fn();
      const completeSpy = jest.fn();

      checker.on('start', startSpy);
      checker.on('suite-start', suiteStartSpy);
      checker.on('suite-complete', suiteCompleteSpy);
      checker.on('complete', completeSpy);

      await checker.run();

      expect(startSpy).toHaveBeenCalledWith({ config: mockConfig });
      expect(suiteStartSpy).toHaveBeenCalledWith({ name: 'test-suite' });
      expect(suiteCompleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-suite',
          status: 'passed',
        }),
      );
      expect(completeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.any(Object),
        }),
      );
    });

    it('should execute only specified suites', async () => {
      const anotherSuite: jest.Mocked<TestSuitePlugin> = {
        name: 'another-suite',
        version: '1.0.0',
        description: 'Another suite',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'another-suite',
          status: 'passed',
          durationMs: 100,
          cases: [],
        }),
      };

      checker.registerSuite(anotherSuite);

      const results = await checker.run({ suites: ['test-suite'] });

      expect(mockSuite.execute).toHaveBeenCalled();
      expect(anotherSuite.execute).not.toHaveBeenCalled();
      expect(results.suites).toHaveLength(1);
      expect(results.suites[0].name).toBe('test-suite');
    });

    it('should handle suite execution errors', async () => {
      mockSuite.execute.mockRejectedValue(new Error('Suite failed'));

      const results = await checker.run();

      expect(results.summary.failed).toBe(1);
      expect(results.suites[0].status).toBe('failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error running test suite'),
        expect.any(Object),
      );
    });

    it('should stop on fail-fast mode', async () => {
      const failingSuite: jest.Mocked<TestSuitePlugin> = {
        name: 'failing-suite',
        version: '1.0.0',
        description: 'Failing suite',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'failing-suite',
          status: 'failed',
          durationMs: 100,
          cases: [
            {
              name: 'failing-test',
              status: 'failed',
              durationMs: 100,
              error: 'Test failed',
            },
          ],
        }),
      };

      checker.registerSuite(failingSuite);

      const results = await checker.run({ failFast: true });

      expect(results.suites).toHaveLength(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stopping execution due to fail-fast mode',
      );
    });

    it('should warn about unknown suites', async () => {
      await checker.run({ suites: ['unknown-suite'] });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Test suite not found: unknown-suite',
      );
    });
  });

  describe('Test Context Creation', () => {
    it('should create test context with all required properties', async () => {
      const mockSuite: jest.Mocked<TestSuitePlugin> = {
        name: 'context-test',
        version: '1.0.0',
        description: 'Context test suite',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockImplementation((context: TestContext) => {
          expect(context.config).toBe(mockConfig);
          expect(context.logger).toBeDefined();
          expect(context.transport).toBe(mockTransport);
          expect(context.fixtures).toBeDefined();
          expect(context.chaos).toBe(mockChaosController);

          return Promise.resolve({
            name: 'context-test',
            status: 'passed',
            durationMs: 100,
            cases: [],
          });
        }),
      };

      checker.registerSuite(mockSuite);
      await checker.run({ suites: ['context-test'] });

      expect(mockSuite.execute).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle transport creation errors', async () => {
      (mockTransportFactory.create as any).mockRejectedValue(
        new Error('Transport creation failed'),
      );

      await expect(checker.run()).rejects.toThrow('Transport creation failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test execution failed',
        expect.any(Object),
      );
    });

    it('should emit error events', async () => {
      const errorSpy = jest.fn();
      checker.on('error', errorSpy);

      (mockTransportFactory.create as any).mockRejectedValue(
        new Error('Transport creation failed'),
      );

      await expect(checker.run()).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Cleanup', () => {
    it('should close transport after execution', async () => {
      const mockSuite: TestSuitePlugin = {
        name: 'cleanup-test',
        version: '1.0.0',
        description: 'Cleanup test',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'cleanup-test',
          status: 'passed',
          durationMs: 100,
          cases: [],
        }),
      };

      checker.registerSuite(mockSuite);
      await checker.run({ suites: ['cleanup-test'] });

      expect(mockTransport.close).toHaveBeenCalled();
    });

    it('should close transport even on execution errors', async () => {
      const mockSuite: TestSuitePlugin = {
        name: 'error-test',
        version: '1.0.0',
        description: 'Error test',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockRejectedValue(new Error('Suite failed')),
      };

      checker.registerSuite(mockSuite);
      await checker.run({ suites: ['error-test'] });

      expect(mockTransport.close).toHaveBeenCalled();
    });
  });

  describe('Results Aggregation', () => {
    it('should aggregate results from multiple suites', async () => {
      const suite1: TestSuitePlugin = {
        name: 'suite1',
        version: '1.0.0',
        description: 'Suite 1',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'suite1',
          status: 'passed',
          durationMs: 100,
          cases: [
            { name: 'test1', status: 'passed', durationMs: 50 },
            {
              name: 'test2',
              status: 'failed',
              durationMs: 50,
              error: 'Failed',
            },
          ],
        }),
      };

      const suite2: TestSuitePlugin = {
        name: 'suite2',
        version: '1.0.0',
        description: 'Suite 2',
        tags: ['test'],
        validate: jest.fn().mockReturnValue({ valid: true }),
        execute: jest.fn().mockResolvedValue({
          name: 'suite2',
          status: 'passed',
          durationMs: 100,
          cases: [
            { name: 'test3', status: 'skipped', durationMs: 0 },
            {
              name: 'test4',
              status: 'warning',
              durationMs: 30,
              warning: 'Warning',
            },
          ],
        }),
      };

      checker.registerSuites([suite1, suite2]);

      const results = await checker.run();

      expect(results.summary.total).toBe(4);
      expect(results.summary.passed).toBe(1);
      expect(results.summary.failed).toBe(1);
      expect(results.summary.skipped).toBe(1);
      expect(results.summary.warnings).toBe(1);
    });

    it('should calculate correct duration', async () => {
      const startTime = Date.now();

      await checker.run();

      const endTime = Date.now();
      const results = await checker.run();

      expect(results.metadata!.durationMs).toBeGreaterThanOrEqual(0);
      expect(results.metadata!.durationMs).toBeLessThan(
        endTime - startTime + 1000,
      );
    });
  });
});
