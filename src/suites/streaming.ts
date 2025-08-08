/**
 * Streaming test suite - validates streaming capabilities and long-running operations
 */

import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
} from '../types/test';
import { CheckConfig } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';

export class StreamingTestSuite implements TestSuitePlugin {
  readonly name = 'streaming';
  readonly version = '1.0.0';
  readonly description =
    'Tests streaming capabilities and long-running operations using official SDK';
  readonly tags = ['advanced', 'streaming', 'performance'];

  validate(config: Partial<CheckConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.target) {
      errors.push('Target configuration is required');
    }

    if (!config.expectations?.tools || config.expectations.tools.length === 0) {
      warnings.push('No tools configured - streaming tests may be limited');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async execute(context: TestContext): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const cases = [];

    try {
      const client = new MCPTestClient(context.logger);

      // Try direct SDK transport first, fallback to custom transport adapter
      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        context.logger.info(
          'Using custom transport adapter for streaming tests',
          {
            targetType: context.config.target.type,
            reason: error.message,
          },
        );
        await client.connectWithCustomTransport(context.transport);
      }

      // Test case 1: Multiple rapid requests
      try {
        await this.testRapidRequests(client, cases, context);
      } catch (error) {
        context.logger.error('Rapid requests test failed', {
          error: error.message,
        });
        cases.push({
          name: 'rapid-requests',
          status: 'failed',
          durationMs: 100,
          error: {
            type: 'TestError',
            message: `Rapid requests test failed: ${error.message}`,
            details: { error: error.message },
          },
        });
      }

      // Test case 2: Long-running operation simulation
      try {
        await this.testLongRunningOperations(client, cases, context);
      } catch (error) {
        context.logger.error('Long-running operations test failed', {
          error: error.message,
        });
        cases.push({
          name: 'long-running-operations',
          status: 'failed',
          durationMs: 100,
          error: {
            type: 'TestError',
            message: `Long-running operations test failed: ${error.message}`,
            details: { error: error.message },
          },
        });
      }

      // Test case 3: Concurrent tool calls
      try {
        await this.testConcurrentCalls(client, cases, context);
      } catch (error) {
        context.logger.error('Concurrent calls test failed', {
          error: error.message,
        });
        cases.push({
          name: 'concurrent-calls',
          status: 'failed',
          durationMs: 100,
          error: {
            type: 'TestError',
            message: `Concurrent calls test failed: ${error.message}`,
            details: { error: error.message },
          },
        });
      }

      // Test case 4: Resource streaming (if supported)
      const serverCapabilities = client.getServerCapabilities();
      if (serverCapabilities?.resources) {
        try {
          await this.testResourceStreaming(client, cases, context);
        } catch (error) {
          context.logger.error('Resource streaming test failed', {
            error: error.message,
          });
          cases.push({
            name: 'resource-streaming',
            status: 'failed',
            durationMs: 100,
            error: {
              type: 'TestError',
              message: `Resource streaming test failed: ${error.message}`,
              details: { error: error.message },
            },
          });
        }
      } else {
        cases.push({
          name: 'resource-streaming',
          status: 'skipped',
          durationMs: 0,
          details: {
            reason: 'Server does not support resources',
          },
        });
      }

      // Clean up
      await client.close();
    } catch (error) {
      context.logger.error('Streaming test suite failed to initialize', {
        error: error.message,
      });

      cases.push({
        name: 'initialization',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'InitializationError',
          message: `Failed to initialize streaming tests: ${error.message}`,
          details: { error: error.message },
        },
      });
    }

    const endTime = Date.now();

    return {
      name: this.name,
      status:
        cases.filter((c) => c.status === 'failed').length === 0
          ? 'passed'
          : 'failed',
      durationMs: endTime - startTime,
      cases,
    };
  }

  private async testRapidRequests(
    client: MCPTestClient,
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    const startTime = Date.now();
    const requestCount = 10;
    const requests = [];

    // Get available tools
    const tools = await client.listTools();
    if (tools.length === 0) {
      cases.push({
        name: 'rapid-requests',
        status: 'skipped',
        durationMs: Date.now() - startTime,
        details: {
          reason: 'No tools available for rapid request testing',
        },
      });
      return;
    }

    const tool = tools[0];

    // Fire off multiple rapid ping requests
    for (let i = 0; i < requestCount; i++) {
      requests.push(client.ping());
    }

    try {
      await Promise.all(requests);
      const duration = Date.now() - startTime;

      cases.push({
        name: 'rapid-requests',
        status: 'passed',
        durationMs: duration,
        details: {
          requestCount,
          averageResponseTime: duration / requestCount,
          totalTime: duration,
        },
      });
    } catch (error) {
      cases.push({
        name: 'rapid-requests',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'RapidRequestError',
          message: `Failed to handle rapid requests: ${error.message}`,
          details: { error: error.message, requestCount },
        },
      });
    }
  }

  private async testLongRunningOperations(
    client: MCPTestClient,
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    const startTime = Date.now();

    // Get available tools
    const tools = await client.listTools();
    if (tools.length === 0) {
      cases.push({
        name: 'long-running-operations',
        status: 'skipped',
        durationMs: Date.now() - startTime,
        details: {
          reason: 'No tools available for long-running operation testing',
        },
      });
      return;
    }

    const tool = tools[0];

    try {
      // Simulate a long-running operation by calling a tool with some data
      const operationStart = Date.now();
      const result = await client.callTool(tool.name, {
        test: 'long-running-simulation',
      });
      const operationTime = Date.now() - operationStart;

      cases.push({
        name: 'long-running-operations',
        status: 'passed',
        durationMs: Date.now() - startTime,
        details: {
          toolName: tool.name,
          operationTime,
          contentLength: result.content?.length || 0,
          isError: result.isError || false,
        },
      });
    } catch (error) {
      cases.push({
        name: 'long-running-operations',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'LongRunningOperationError',
          message: `Long-running operation failed: ${error.message}`,
          details: { error: error.message, toolName: tool.name },
        },
      });
    }
  }

  private async testConcurrentCalls(
    client: MCPTestClient,
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    const startTime = Date.now();
    const concurrentCount = 5;

    // Get available tools
    const tools = await client.listTools();
    if (tools.length === 0) {
      cases.push({
        name: 'concurrent-calls',
        status: 'skipped',
        durationMs: Date.now() - startTime,
        details: {
          reason: 'No tools available for concurrent call testing',
        },
      });
      return;
    }

    const tool = tools[0];
    const concurrentCalls = [];

    // Create multiple concurrent tool calls
    for (let i = 0; i < concurrentCount; i++) {
      concurrentCalls.push(
        client.callTool(tool.name, { concurrent: true, callId: i }),
      );
    }

    try {
      const results = await Promise.all(concurrentCalls);
      const duration = Date.now() - startTime;

      const successCount = results.filter((r) => !r.isError).length;
      const errorCount = results.length - successCount;

      cases.push({
        name: 'concurrent-calls',
        status: errorCount === 0 ? 'passed' : 'failed',
        durationMs: duration,
        details: {
          concurrentCount,
          successCount,
          errorCount,
          averageResponseTime: duration / concurrentCount,
          totalTime: duration,
        },
        ...(errorCount > 0
          ? {
              error: {
                type: 'ConcurrentCallError',
                message: `${errorCount} out of ${concurrentCount} concurrent calls failed`,
                details: { errorCount, successCount },
              },
            }
          : {}),
      });
    } catch (error) {
      cases.push({
        name: 'concurrent-calls',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ConcurrentCallError',
          message: `Concurrent calls failed: ${error.message}`,
          details: { error: error.message, concurrentCount },
        },
      });
    }
  }

  private async testResourceStreaming(
    client: MCPTestClient,
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // List available resources
      const resources = await client.listResources();

      if (resources.length === 0) {
        cases.push({
          name: 'resource-streaming',
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: {
            reason: 'No resources available for streaming testing',
          },
        });
        return;
      }

      const resource = resources[0];

      // Read the resource (simulating streaming)
      const readStart = Date.now();
      const contents = await client.readResource(resource.uri);
      const readTime = Date.now() - readStart;

      cases.push({
        name: 'resource-streaming',
        status: 'passed',
        durationMs: Date.now() - startTime,
        details: {
          resourceUri: resource.uri,
          resourceName: resource.name,
          contentCount: contents.length,
          readTime,
        },
      });
    } catch (error) {
      cases.push({
        name: 'resource-streaming',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ResourceStreamingError',
          message: `Resource streaming test failed: ${error.message}`,
          details: { error: error.message },
        },
      });
    }
  }
}
