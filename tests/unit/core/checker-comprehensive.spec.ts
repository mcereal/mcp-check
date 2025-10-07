/**
 * Comprehensive unit tests for MCPChecker - Core orchestration class
 */

import { MCPChecker } from '../../../src/core/checker';
import { HandshakeTestSuite } from '../../../src/suites/handshake';
import { ToolDiscoveryTestSuite } from '../../../src/suites/tool-discovery';
import { ResolvedCheckConfig } from '../../../src/types/config';
import { TestSuitePlugin, TestExecutionOptions } from '../../../src/types/test';
import { Logger } from '../../../src/types/reporting';
import { TransportFactory } from '../../../src/types/transport';

// Mock all dependencies
jest.mock('../../../src/suites/handshake');
jest.mock('../../../src/suites/tool-discovery');
jest.mock('../../../src/core/logger');
jest.mock('../../../src/core/fixture-manager');

describe('MCPChecker', () => {
  let checker: MCPChecker;
  let mockConfig: ResolvedCheckConfig;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransportFactory: jest.Mocked<TransportFactory>;
  let mockHandshakeSuite: jest.Mocked<HandshakeTestSuite>;
  let mockToolSuite: jest.Mocked<ToolDiscoveryTestSuite>;

  beforeEach(() => {
    mockConfig = {
      $schema: 'test-schema',
      target: {
        type: 'stdio',
        command: 'test-server',
        args: ['--test'],
      },
      suites: ['handshake', 'tool-discovery'],
      chaos: {
        enabled: false,
      },
      reporting: {
        formats: ['json'],
        outputDir: './test-reports',
        enableTelemetry: false,
      },
      parallelism: 1,
      expectations: {
        tools: [{ name: 'test-tool', required: true }],
      },
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;

    mockTransportFactory = {
      create: jest.fn(),
      supports: jest.fn(),
    } as any;

    mockHandshakeSuite = {
      name: 'handshake',
      version: '1.0.0',
      description: 'Handshake tests',
      tags: ['core'],
      validate: jest.fn(),
      execute: jest.fn(),
    } as any;

    mockToolSuite = {
      name: 'tool-discovery',
      version: '1.0.0',
      description: 'Tool discovery tests',
      tags: ['core', 'tools'],
      validate: jest.fn(),
      execute: jest.fn(),
    } as any;

    // Mock the constructors
    (
      HandshakeTestSuite as jest.MockedClass<typeof HandshakeTestSuite>
    ).mockImplementation(() => mockHandshakeSuite);
    (
      ToolDiscoveryTestSuite as jest.MockedClass<typeof ToolDiscoveryTestSuite>
    ).mockImplementation(() => mockToolSuite);

    checker = new MCPChecker(mockConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    it('should create instance with provided config and logger', () => {
      expect(checker).toBeInstanceOf(MCPChecker);
    });

    it('should create instance with default logger when none provided', () => {
      const { createLogger } = require('../../../src/core/logger');
      createLogger.mockReturnValue(mockLogger);

      const testChecker = new MCPChecker(mockConfig);
      expect(testChecker).toBeInstanceOf(MCPChecker);
      expect(createLogger).toHaveBeenCalledWith('info');
    });
  });

  describe('Suite Management', () => {
    describe('registerSuite', () => {
      it('should register a single test suite', () => {
        checker.registerSuite(mockHandshakeSuite);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Registered test suite: handshake',
        );
      });

      it('should register multiple test suites', () => {
        const suites = [mockHandshakeSuite, mockToolSuite];
        checker.registerSuites(suites);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Registered test suite: handshake',
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'Registered test suite: tool-discovery',
        );
      });
    });

    describe('setTransportFactory', () => {
      it('should set transport factory', () => {
        checker.setTransportFactory(mockTransportFactory);
        // No direct way to verify this, but it should not throw
      });
    });

    describe('setChaosController', () => {
      it('should set chaos controller', () => {
        const mockChaosController = {} as any;
        checker.setChaosController(mockChaosController);
        // No direct way to verify this, but it should not throw
      });
    });
  });

  describe('Test Execution', () => {
    beforeEach(() => {
      checker.registerSuites([mockHandshakeSuite, mockToolSuite]);

      // Setup transport factory mock
      const mockTransport = {
        type: 'stdio' as const,
        state: 'connected' as const,
        stats: { messagesSent: 0, messagesReceived: 0, errorsCount: 0 },
        connect: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        waitForMessage: jest.fn(),
      };
      mockTransportFactory.create.mockResolvedValue(mockTransport);
      checker.setTransportFactory(mockTransportFactory);
    });

    describe('run', () => {
      it('should execute all registered suites successfully', async () => {
        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'passed',
          durationMs: 100,
          cases: [
            {
              name: 'connection-test',
              status: 'passed',
              durationMs: 50,
            },
          ],
        });

        mockToolSuite.execute.mockResolvedValue({
          name: 'tool-discovery',
          status: 'passed',
          durationMs: 150,
          cases: [
            {
              name: 'tool-enumeration',
              status: 'passed',
              durationMs: 75,
            },
          ],
        });

        const results = await checker.run();

        expect(results.overallStatus).toBe('passed');
        expect(results.suites).toHaveLength(2);
        expect(results.summary.totalSuites).toBe(2);
        expect(results.summary.passedSuites).toBe(2);
        expect(results.summary.failedSuites).toBe(0);
      });

      it('should handle suite execution failures', async () => {
        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'failed',
          durationMs: 100,
          cases: [
            {
              name: 'connection-test',
              status: 'failed',
              durationMs: 50,
              error: {
                type: 'ConnectionError',
                message: 'Failed to connect',
              },
            },
          ],
        });

        mockToolSuite.execute.mockResolvedValue({
          name: 'tool-discovery',
          status: 'passed',
          durationMs: 150,
          cases: [],
        });

        const results = await checker.run();

        expect(results.overallStatus).toBe('failed');
        expect(results.summary.failedSuites).toBe(1);
        expect(results.summary.passedSuites).toBe(1);
      });

      it('should handle suite execution errors', async () => {
        mockHandshakeSuite.execute.mockRejectedValue(
          new Error('Suite crashed'),
        );
        mockToolSuite.execute.mockResolvedValue({
          name: 'tool-discovery',
          status: 'passed',
          durationMs: 150,
          cases: [],
        });

        const results = await checker.run();

        expect(results.overallStatus).toBe('failed');
        expect(results.suites[0].status).toBe('failed');
        expect(results.suites[0].setup?.error).toContain('Suite crashed');
      });

      it('should respect failFast option', async () => {
        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'failed',
          durationMs: 100,
          cases: [
            {
              name: 'connection-test',
              status: 'failed',
              durationMs: 50,
              error: {
                type: 'ConnectionError',
                message: 'Failed to connect',
              },
            },
          ],
        });

        const options: TestExecutionOptions = {
          failFast: true,
        };

        const results = await checker.run(options);

        expect(results.overallStatus).toBe('failed');
        expect(mockToolSuite.execute).not.toHaveBeenCalled();
      });

      it('should filter suites by tags', async () => {
        const options: TestExecutionOptions = {
          includeTags: ['tools'],
        };

        mockToolSuite.execute.mockResolvedValue({
          name: 'tool-discovery',
          status: 'passed',
          durationMs: 150,
          cases: [],
        });

        const results = await checker.run(options);

        expect(mockHandshakeSuite.execute).not.toHaveBeenCalled();
        expect(mockToolSuite.execute).toHaveBeenCalled();
        expect(results.suites).toHaveLength(1);
      });

      it('should exclude suites by tags', async () => {
        const options: TestExecutionOptions = {
          excludeTags: ['tools'],
        };

        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'passed',
          durationMs: 100,
          cases: [],
        });

        const results = await checker.run(options);

        expect(mockHandshakeSuite.execute).toHaveBeenCalled();
        expect(mockToolSuite.execute).not.toHaveBeenCalled();
        expect(results.suites).toHaveLength(1);
      });

      it('should run specific suites when requested', async () => {
        const options: TestExecutionOptions = {
          suites: ['handshake'],
        };

        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'passed',
          durationMs: 100,
          cases: [],
        });

        const results = await checker.run(options);

        expect(mockHandshakeSuite.execute).toHaveBeenCalled();
        expect(mockToolSuite.execute).not.toHaveBeenCalled();
        expect(results.suites).toHaveLength(1);
      });

      it('should throw error when no valid suites found', async () => {
        const options: TestExecutionOptions = {
          suites: ['non-existent-suite'],
        };

        await expect(checker.run(options)).rejects.toThrow(
          'No valid test suites found to run',
        );
      });

      it('should emit events during execution', async () => {
        const startHandler = jest.fn();
        const suiteStartHandler = jest.fn();
        const suiteCompleteHandler = jest.fn();
        const completeHandler = jest.fn();

        checker.on('start', startHandler);
        checker.on('suite-start', suiteStartHandler);
        checker.on('suite-complete', suiteCompleteHandler);
        checker.on('complete', completeHandler);

        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'passed',
          durationMs: 100,
          cases: [],
        });

        mockToolSuite.execute.mockResolvedValue({
          name: 'tool-discovery',
          status: 'passed',
          durationMs: 150,
          cases: [],
        });

        await checker.run();

        expect(startHandler).toHaveBeenCalledWith({
          config: mockConfig,
          timestamp: expect.any(String),
        });

        expect(suiteStartHandler).toHaveBeenCalledTimes(2);
        expect(suiteStartHandler).toHaveBeenCalledWith({ name: 'handshake' });
        expect(suiteStartHandler).toHaveBeenCalledWith({
          name: 'tool-discovery',
        });

        expect(suiteCompleteHandler).toHaveBeenCalledTimes(2);
        expect(completeHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            overallStatus: 'passed',
          }),
        );
      });
    });

    describe('Transport Management', () => {
      it('should create transport using factory', async () => {
        const mockTransport = {
          type: 'stdio' as const,
          state: 'connected' as const,
          stats: { messagesSent: 0, messagesReceived: 0, errorsCount: 0 },
          connect: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
          waitForMessage: jest.fn(),
        };

        mockTransportFactory.create.mockResolvedValue(mockTransport);
        checker.setTransportFactory(mockTransportFactory);

        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'passed',
          durationMs: 100,
          cases: [],
        });

        await checker.run();

        expect(mockTransportFactory.create).toHaveBeenCalledWith(
          mockConfig.target,
        );
        expect(mockTransport.close).toHaveBeenCalled();
      });

      it('should handle transport creation failures', async () => {
        mockTransportFactory.create.mockRejectedValue(
          new Error('Transport creation failed'),
        );
        checker.setTransportFactory(mockTransportFactory);

        await expect(checker.run()).rejects.toThrow(
          'Transport creation failed',
        );
      });

      it('should handle transport cleanup failures gracefully', async () => {
        const mockTransport = {
          type: 'stdio' as const,
          state: 'connected' as const,
          stats: { messagesSent: 0, messagesReceived: 0, errorsCount: 0 },
          connect: jest.fn(),
          send: jest.fn(),
          close: jest.fn().mockRejectedValue(new Error('Close failed')),
          on: jest.fn(),
          off: jest.fn(),
          waitForMessage: jest.fn(),
        };

        mockTransportFactory.create.mockResolvedValue(mockTransport);
        checker.setTransportFactory(mockTransportFactory);

        mockHandshakeSuite.execute.mockResolvedValue({
          name: 'handshake',
          status: 'passed',
          durationMs: 100,
          cases: [],
        });

        // Should not throw despite cleanup failure
        const results = await checker.run();

        expect(results.overallStatus).toBe('passed');
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Failed to cleanup transport',
          { error: expect.any(Error) },
        );
      });
    });

    describe('Context Creation', () => {
      it('should create proper test context', async () => {
        const mockTransport = {
          type: 'stdio' as const,
          state: 'connected' as const,
          stats: { messagesSent: 0, messagesReceived: 0, errorsCount: 0 },
          connect: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
          waitForMessage: jest.fn(),
        };

        mockTransportFactory.create.mockResolvedValue(mockTransport);
        checker.setTransportFactory(mockTransportFactory);

        let capturedContext: any;
        mockHandshakeSuite.execute.mockImplementation((context) => {
          capturedContext = context;
          return Promise.resolve({
            name: 'handshake',
            status: 'passed',
            durationMs: 100,
            cases: [],
          });
        });

        await checker.run();

        expect(capturedContext).toMatchObject({
          transport: mockTransport,
          logger: expect.any(Object),
          config: mockConfig,
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle missing transport factory', async () => {
        // Don't set transport factory
        await expect(checker.run()).rejects.toThrow(
          'Transport factory not configured',
        );
      });

      it('should handle empty suite configuration', async () => {
        const emptyConfig = { ...mockConfig, suites: [] };
        const emptyChecker = new MCPChecker(emptyConfig, mockLogger);

        await expect(emptyChecker.run()).rejects.toThrow(
          'No valid test suites found to run',
        );
      });
    });

    describe('Timing and Performance', () => {
      it('should track execution timing', async () => {
        mockHandshakeSuite.execute.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    name: 'handshake',
                    status: 'passed',
                    durationMs: 100,
                    cases: [],
                  }),
                50,
              ),
            ),
        );

        const startTime = Date.now();
        const results = await checker.run();
        const endTime = Date.now();

        expect(results.durationMs).toBeGreaterThanOrEqual(40);
        expect(results.durationMs).toBeLessThanOrEqual(
          endTime - startTime + 10,
        );
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should work with minimal configuration', () => {
      const minimalConfig: ResolvedCheckConfig = {
        $schema: 'test',
        target: { type: 'stdio', command: 'test' },
        suites: ['handshake'],
        chaos: { enabled: false },
        reporting: {
          formats: [],
          outputDir: './reports',
          enableTelemetry: false,
        },
        parallelism: 1,
      };

      const minimalChecker = new MCPChecker(minimalConfig, mockLogger);
      expect(minimalChecker).toBeInstanceOf(MCPChecker);
    });

    it('should handle chaos configuration', () => {
      const chaosConfig: ResolvedCheckConfig = {
        ...mockConfig,
        chaos: {
          enabled: true,
          failureRate: 0.1,
          networkLatency: { min: 10, max: 100 },
          scenarios: ['network', 'protocol'],
        },
      };

      const chaosChecker = new MCPChecker(chaosConfig, mockLogger);
      expect(chaosChecker).toBeInstanceOf(MCPChecker);
    });
  });
});
