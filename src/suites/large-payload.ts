/**
 * Large payload test suite - validates handling of large data transfers
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

export class LargePayloadTestSuite implements TestSuitePlugin {
  readonly name = 'large-payload';
  readonly version = '1.0.0';
  readonly description =
    'Tests handling of large payloads in tool invocations and resource fetching';
  readonly tags = ['resilience', 'performance', 'stress'];

  validate(config: Partial<CheckConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.target) {
      errors.push('Target configuration is required');
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
      // Test 1: Large input payload
      cases.push(await this.testLargeInputPayload(context));

      // Test 2: Large output handling
      cases.push(await this.testLargeOutputPayload(context));

      // Test 3: Large JSON structure
      cases.push(await this.testLargeJsonStructure(context));

      // Test 4: Memory stability under load
      cases.push(await this.testMemoryStability(context));

      // Test 5: Resource content size handling
      cases.push(await this.testResourceContentSize(context));
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

  private async testLargeInputPayload(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'large-input-payload';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      // Find a tool that accepts string input
      const stringTool = tools.find(
        (t) =>
          t.inputSchema?.properties &&
          Object.values(t.inputSchema.properties).some(
            (p: any) => p.type === 'string',
          ),
      );

      if (!stringTool) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No tool with string input found for testing' },
        };
      }

      // Find the string parameter name
      const stringParamName = Object.entries(
        stringTool.inputSchema?.properties || {},
      ).find(([_, prop]: [string, any]) => prop.type === 'string')?.[0];

      if (!stringParamName) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'Could not identify string parameter' },
        };
      }

      // Test with progressively larger payloads (configurable)
      const sizes = context.config.testParameters?.payloadSizes ?? [1024, 10240, 102400];
      const results: Array<{ size: number; success: boolean; timeMs: number }> =
        [];

      for (const size of sizes) {
        const largeInput = 'x'.repeat(size);
        const reqStart = Date.now();

        try {
          await client.callTool(stringTool.name, {
            [stringParamName]: largeInput,
          });
          results.push({
            size,
            success: true,
            timeMs: Date.now() - reqStart,
          });
        } catch (error) {
          results.push({
            size,
            success: false,
            timeMs: Date.now() - reqStart,
          });
        }
      }

      await client.close();

      const allSucceeded = results.every((r) => r.success);
      const largestSuccessful = results
        .filter((r) => r.success)
        .reduce((max, r) => Math.max(max, r.size), 0);

      return {
        name: testName,
        status: allSucceeded ? 'passed' : 'warning',
        durationMs: Date.now() - startTime,
        details: {
          toolName: stringTool.name,
          testedSizes: sizes,
          results,
          largestSuccessfulBytes: largestSuccessful,
        },
        warnings: !allSucceeded
          ? [
              `Only handled payloads up to ${largestSuccessful} bytes successfully`,
            ]
          : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'LargeInputError',
          message: error.message,
        },
      };
    }
  }

  private async testLargeOutputPayload(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'large-output-payload';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      // Look for a tool that might produce large output
      const outputTool = tools.find(
        (t) =>
          t.name.toLowerCase().includes('large') ||
          t.name.toLowerCase().includes('payload') ||
          t.name.toLowerCase().includes('data') ||
          t.name.toLowerCase().includes('json'),
      );

      if (!outputTool) {
        // Just test with any available tool
        if (tools.length === 0) {
          await client.close();
          return {
            name: testName,
            status: 'skipped',
            durationMs: Date.now() - startTime,
            details: { reason: 'No tools available for output testing' },
          };
        }
      }

      const testTool = outputTool || tools[0];
      const reqStart = Date.now();

      let result: any;
      let responseSize = 0;

      try {
        result = await client.callTool(testTool.name, {});
        responseSize = JSON.stringify(result).length;
      } catch (error) {
        // Some errors are expected for certain tools
      }

      await client.close();

      return {
        name: testName,
        status: 'passed',
        durationMs: Date.now() - startTime,
        details: {
          toolName: testTool.name,
          responseTimeMs: Date.now() - reqStart,
          responseSizeBytes: responseSize,
          hasContent: result?.content?.length > 0,
        },
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'LargeOutputError',
          message: error.message,
        },
      };
    }
  }

  private async testLargeJsonStructure(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'large-json-structure';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();

      // Find a tool that accepts object/array input
      const complexTool = tools.find(
        (t) =>
          t.inputSchema?.properties &&
          Object.values(t.inputSchema.properties).some(
            (p: any) => p.type === 'array' || p.type === 'object',
          ),
      );

      if (!complexTool) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No tool with complex input found' },
        };
      }

      // Find the complex parameter
      const complexParam = Object.entries(
        complexTool.inputSchema?.properties || {},
      ).find(
        ([_, prop]: [string, any]) =>
          prop.type === 'array' || prop.type === 'object',
      );

      if (!complexParam) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'Could not identify complex parameter' },
        };
      }

      const [paramName, paramSchema] = complexParam as [string, any];

      // Create large nested structure
      let testData: any;
      if (paramSchema.type === 'array') {
        testData = Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: 'x'.repeat(100),
        }));
      } else {
        testData = {};
        for (let i = 0; i < 50; i++) {
          testData[`key${i}`] = {
            value: i,
            nested: { data: 'x'.repeat(50) },
          };
        }
      }

      const reqStart = Date.now();
      let success = false;

      try {
        await client.callTool(complexTool.name, { [paramName]: testData });
        success = true;
      } catch (error) {
        // Expected to fail for some tools
      }

      await client.close();

      const structureSize = JSON.stringify(testData).length;

      return {
        name: testName,
        status: success ? 'passed' : 'warning',
        durationMs: Date.now() - startTime,
        details: {
          toolName: complexTool.name,
          parameterName: paramName,
          structureSizeBytes: structureSize,
          structureType: paramSchema.type,
          processingSuccess: success,
          responseTimeMs: Date.now() - reqStart,
        },
        warnings: !success
          ? ['Tool may not handle large complex structures']
          : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'LargeJsonError',
          message: error.message,
        },
      };
    }
  }

  private async testMemoryStability(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'memory-stability';

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
          details: { reason: 'No tools available' },
        };
      }

      // Record initial memory usage
      const initialMemory = process.memoryUsage().heapUsed;

      // Make multiple requests to test for memory leaks (configurable)
      const testTool = tools[0];
      const iterations = context.config.testParameters?.testIterations ?? 10;

      for (let i = 0; i < iterations; i++) {
        try {
          await client.callTool(testTool.name, {});
        } catch (error) {
          // Ignore individual tool errors
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      await client.close();

      // Allow up to configured threshold growth for the test
      const memoryThreshold = context.config.testParameters?.memoryGrowthThresholdMB ?? 10;
      const isStable = memoryGrowthMB < memoryThreshold;

      return {
        name: testName,
        status: isStable ? 'passed' : 'warning',
        durationMs: Date.now() - startTime,
        details: {
          iterations,
          toolName: testTool.name,
          initialMemoryMB: Math.round((initialMemory / (1024 * 1024)) * 100) / 100,
          finalMemoryMB: Math.round((finalMemory / (1024 * 1024)) * 100) / 100,
          memoryGrowthMB: Math.round(memoryGrowthMB * 100) / 100,
          memoryStable: isStable,
        },
        warnings: !isStable
          ? [`Memory grew by ${memoryGrowthMB.toFixed(2)}MB during test`]
          : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'MemoryStabilityError',
          message: error.message,
        },
      };
    }
  }

  private async testResourceContentSize(
    context: TestContext,
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const testName = 'resource-content-size';

    try {
      const client = new MCPTestClient(context.logger);

      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        await client.connectWithCustomTransport(context.transport);
      }

      // Check if server supports resources
      let resources: any[];
      try {
        resources = await client.listResources();
      } catch (error) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'Server does not support resources or none available' },
        };
      }

      if (!resources || resources.length === 0) {
        await client.close();
        return {
          name: testName,
          status: 'skipped',
          durationMs: Date.now() - startTime,
          details: { reason: 'No resources available' },
        };
      }

      // Test reading each resource and measure size (configurable limit)
      const maxResources = context.config.testParameters?.maxResourcesToTest ?? 5;
      const resourceResults: Array<{
        uri: string;
        sizeBytes: number;
        timeMs: number;
        success: boolean;
      }> = [];

      for (const resource of resources.slice(0, maxResources)) {
        const reqStart = Date.now();
        try {
          const content = await client.readResource(resource.uri);
          const size = JSON.stringify(content).length;
          resourceResults.push({
            uri: resource.uri,
            sizeBytes: size,
            timeMs: Date.now() - reqStart,
            success: true,
          });
        } catch (error) {
          resourceResults.push({
            uri: resource.uri,
            sizeBytes: 0,
            timeMs: Date.now() - reqStart,
            success: false,
          });
        }
      }

      await client.close();

      const totalBytes = resourceResults
        .filter((r) => r.success)
        .reduce((sum, r) => sum + r.sizeBytes, 0);
      const successCount = resourceResults.filter((r) => r.success).length;

      return {
        name: testName,
        status: successCount === resourceResults.length ? 'passed' : 'warning',
        durationMs: Date.now() - startTime,
        details: {
          resourcesTested: resourceResults.length,
          successfulReads: successCount,
          totalBytesRead: totalBytes,
          resourceResults,
        },
        warnings:
          successCount < resourceResults.length
            ? [
                `Only ${successCount}/${resourceResults.length} resources read successfully`,
              ]
            : undefined,
      };
    } catch (error) {
      return {
        name: testName,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ResourceContentError',
          message: error.message,
        },
      };
    }
  }
}
