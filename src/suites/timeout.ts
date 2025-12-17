/**
 * Timeout behavior test suite - validates timeout handling and slow operations
 */

import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  TestCaseResult,
  ValidationResult,
} from '../types/test';
import { CheckConfig } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';

export class TimeoutTestSuite implements TestSuitePlugin {
  readonly name = 'timeout';
  readonly version = '1.0.0';
  readonly description =
    'Tests timeout behavior for connections, tool invocations, and slow operations';
  readonly tags = ['resilience', 'timeout', 'performance'];

  validate(config: Partial<CheckConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.target) {
      errors.push('Target configuration is required');
    }

    if (!config.timeouts) {
      warnings.push(
        'No timeout configuration specified - using defaults which may not exercise timeout behavior',
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async execute(context: TestContext): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const cases: TestCaseResult[] = [];

    try {
      // Test 1: Connection timeout behavior
      cases.push(await this.testConnectionTimeout(context));

      // Test 2: Tool invocation timeout (if tools available)
      cases.push(await this.testInvocationTimeout(context));

      // Test 3: Multiple concurrent requests with varying response times
      cases.push(await this.testConcurrentTimeouts(context));

      // Test 4: Timeout recovery (can we continue after timeout?)
      cases.push(await this.testTimeoutRecovery(context));

      // Test 5: Progressive timeout handling
      cases.push(await this.testProgressiveTimeout(context));
    } catch (error) {
      cases.push({
        name: 'suite-execution',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'SuiteExecutionError',
          message: error.message,
          stack: error.stack,
        },
      });
    }

    const passed = cases.filter((c) => c.status === 'passed').length;
    const failed = cases.filter((c) => c.status === 'failed').length;

    return {
      name: this.name,
      status: failed > 0 ? 'failed' : 'passed',
      durationMs: Date.now() - startTime,
      cases,
    };
  }

  private async testConnectionTimeout(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'connection-timeout-behavior';

    try {
      const client = new MCPTestClient(context.logger);

      // Test that connection completes within configured timeout
      const connectTimeout = context.config.timeouts?.connectMs || 5000;

      const connectPromise = (async () => {
        try {
          await client.connectFromTarget(context.config.target);
        } catch (error) {
          await client.connectWithCustomTransport(context.transport);
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Connection timeout exceeded')),
          connectTimeout + 1000, // Allow some buffer
        );
      });

      await Promise.race([connectPromise, timeoutPromise]);

      const elapsed = Date.now() - startTime;
      await client.close();

      return {
        name: testName,
        status: 'passed',
        durationMs: elapsed,
        details: {
          configuredTimeoutMs: connectTimeout,
          actualConnectionMs: elapsed,
          withinTimeout: elapsed < connectTimeout,
        },
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ConnectionTimeoutError',
          message: error.message,
        },
      };
    }
  }

  private async testInvocationTimeout(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'invocation-timeout-behavior';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      if (tools.length === 0) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No tools available for timeout testing' },
        };
      }

      // Find a tool that might be slow or just use the first available
      const testTool = tools.find(
        (t) =>
          t.name.toLowerCase().includes('slow') ||
          t.name.toLowerCase().includes('delay'),
      ) || tools[0];

      const invokeTimeout = context.config.timeouts?.invokeMs || 10000;

      // Invoke the tool and verify it completes
      const invokeStart = Date.now();
      try {
        await client.callTool(testTool.name, {});
      } catch (error) {
        // Tool errors are OK - we're testing timeout, not tool functionality
        if (
          error.message.includes('timeout') ||
          error.message.includes('Timeout')
        ) {
          throw error; // Re-throw actual timeout errors
        }
      }

      const elapsed = Date.now() - invokeStart;
      await client.close();

      return {
        name: testName,
        status: elapsed < invokeTimeout ? 'passed' : 'warning',
        durationMs: Date.now() - startTime,
        details: {
          toolName: testTool.name,
          configuredTimeoutMs: invokeTimeout,
          actualInvocationMs: elapsed,
        },
        warnings:
          elapsed >= invokeTimeout
            ? [`Tool invocation took longer than configured timeout`]
            : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'InvocationTimeoutError',
          message: error.message,
        },
      };
    }
  }

  private async testConcurrentTimeouts(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'concurrent-timeout-handling';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      if (tools.length === 0) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No tools available for concurrent testing' },
        };
      }

      // Issue multiple concurrent requests
      const concurrentCount = Math.min(3, tools.length);
      const requests = tools.slice(0, concurrentCount).map((tool) =>
        client.callTool(tool.name, {}).catch((e) => ({
          error: e.message,
          tool: tool.name,
        })),
      );

      const results = await Promise.allSettled(requests);
      const elapsed = Date.now() - startTime;

      await client.close();

      const successful = results.filter((r) => r.status === 'fulfilled').length;

      return {
        name: testName,
        status: successful === concurrentCount ? 'passed' : 'warning',
        durationMs: elapsed,
        details: {
          concurrentRequests: concurrentCount,
          successfulResponses: successful,
          totalDurationMs: elapsed,
        },
        warnings:
          successful < concurrentCount
            ? [`Only ${successful}/${concurrentCount} concurrent requests succeeded`]
            : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ConcurrentTimeoutError',
          message: error.message,
        },
      };
    }
  }

  private async testTimeoutRecovery(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'timeout-recovery';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      if (tools.length === 0) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No tools available for recovery testing' },
        };
      }

      // First request
      const firstTool = tools[0];
      try {
        await client.callTool(firstTool.name, {});
      } catch (error) {
        // Ignore tool errors
      }

      // Brief pause
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second request - should work if connection recovers properly
      let secondRequestSucceeded = false;
      try {
        await client.callTool(firstTool.name, {});
        secondRequestSucceeded = true;
      } catch (error) {
        // Track failure
      }

      await client.close();

      return {
        name: testName,
        status: secondRequestSucceeded ? 'passed' : 'warning',
        durationMs: Date.now() - startTime,
        details: {
          firstRequestTool: firstTool.name,
          secondRequestSucceeded,
          recoveryMessage: secondRequestSucceeded
            ? 'Connection recovered successfully after first request'
            : 'Connection may not have recovered properly',
        },
        warnings: !secondRequestSucceeded
          ? ['Server may have issues recovering after requests']
          : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'RecoveryError',
          message: error.message,
        },
      };
    }
  }

  private async testProgressiveTimeout(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'progressive-timeout';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      if (tools.length === 0) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No tools available for progressive testing' },
        };
      }

      // Make several requests and track response times
      const responseTimes: number[] = [];
      const testTool = tools[0];

      for (let i = 0; i < 5; i++) {
        const reqStart = Date.now();
        try {
          await client.callTool(testTool.name, {});
        } catch (error) {
          // Ignore tool errors
        }
        responseTimes.push(Date.now() - reqStart);
      }

      await client.close();

      const avgResponseTime =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      const variance = maxResponseTime - minResponseTime;

      return {
        name: testName,
        status: 'passed',
        durationMs: Date.now() - startTime,
        details: {
          requestCount: responseTimes.length,
          averageResponseMs: Math.round(avgResponseTime),
          minResponseMs: minResponseTime,
          maxResponseMs: maxResponseTime,
          varianceMs: variance,
          consistent: variance < avgResponseTime * 2, // Response times within 2x average
        },
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ProgressiveTimeoutError',
          message: error.message,
        },
      };
    }
  }
}
