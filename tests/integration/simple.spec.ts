/**
 * Simple integration test for the checker
 */

import { MCPChecker } from '../../src/core/checker';
import { DefaultTransportFactory } from '../../src/transports/factory';
import { createLogger } from '../../src/core/logger';
import { createTestConfig } from '../helpers/test-utils';
import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
} from '../../src/types/test';

// Create a simple test suite for testing
class SimpleTestSuite implements TestSuitePlugin {
  name = 'simple-test';
  version = '1.0.0';
  description = 'A simple test suite for testing';
  tags = ['test'];

  validate(config: any): ValidationResult {
    return { valid: true };
  }

  async execute(context: TestContext): Promise<TestSuiteResult> {
    const startTime = Date.now();

    // Simulate some test cases
    return {
      name: this.name,
      status: 'passed',
      durationMs: Date.now() - startTime,
      cases: [
        {
          name: 'dummy-test-1',
          status: 'passed',
          durationMs: 10,
          details: { message: 'Test passed' },
        },
        {
          name: 'dummy-test-2',
          status: 'passed',
          durationMs: 15,
          details: { message: 'Another test passed' },
        },
      ],
    };
  }
}

describe('Checker Integration Tests', () => {
  it('should create a checker and register test suites', () => {
    const config = createTestConfig({
      target: {
        type: 'stdio',
        command: 'echo',
        args: ['{}'],
      },
    });

    const logger = createLogger('error'); // Quiet for tests
    const checker = new MCPChecker(config, logger);

    expect(checker).toBeDefined();

    // Register a test suite
    const testSuite = new SimpleTestSuite();
    checker.registerSuite(testSuite);

    // Should not throw
    expect(() =>
      checker.setTransportFactory(new DefaultTransportFactory()),
    ).not.toThrow();
  });

  it('should validate checker configuration', () => {
    const config = createTestConfig();
    const logger = createLogger('error');
    const checker = new MCPChecker(config, logger);

    expect(config.target).toBeDefined();
    expect(config.suites).toBeDefined();
    expect(config.timeouts).toBeDefined();
    expect(config.reporting).toBeDefined();
  });

  it('should handle test suite registration', () => {
    const config = createTestConfig();
    const logger = createLogger('error');
    const checker = new MCPChecker(config, logger);

    const suite1 = new SimpleTestSuite();
    const suite2 = new SimpleTestSuite();
    suite2.name = 'simple-test-2';

    checker.registerSuite(suite1);
    checker.registerSuites([suite2]);

    // Should handle multiple registrations
    expect(() => checker.registerSuite(suite1)).not.toThrow();
  });
});

describe('Test Framework Components', () => {
  it('should create transport factory', () => {
    const factory = new DefaultTransportFactory();
    expect(factory).toBeDefined();

    // Test that it supports the different transport types
    expect(factory.supports('stdio')).toBe(true);
    expect(factory.supports('tcp')).toBe(true);
    expect(factory.supports('websocket')).toBe(true);
    expect(factory.supports('invalid')).toBe(false);
  });

  it('should create transports for different target types', () => {
    const factory = new DefaultTransportFactory();

    const stdioTransport = factory.create({
      type: 'stdio',
      command: 'echo',
      args: ['test'],
    });
    expect(stdioTransport.type).toBe('stdio');

    const tcpTransport = factory.create({
      type: 'tcp',
      host: 'localhost',
      port: 8080,
    });
    expect(tcpTransport.type).toBe('tcp');

    const wsTransport = factory.create({
      type: 'websocket',
      url: 'ws://localhost:8080',
    });
    expect(wsTransport.type).toBe('websocket');
  });
});
