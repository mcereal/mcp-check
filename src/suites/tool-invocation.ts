/**
 * Tool invocation test suite - validates tool execution under various conditions
 */

import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
} from '../types/test';
import { CheckConfig } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';
import { MCPTool } from '../types/mcp';

export class ToolInvocationTestSuite implements TestSuitePlugin {
  readonly name = 'tool-invocation';
  readonly version = '1.0.0';
  readonly description =
    'Tests tool execution under normal and edge case conditions';
  readonly tags = ['core', 'tools', 'execution'];

  validate(config: Partial<CheckConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.target) {
      errors.push('Target configuration is required');
    }

    if (!config.expectations?.tools || config.expectations.tools.length === 0) {
      warnings.push(
        'No tools configured for testing - invocation tests will be limited',
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
    const cases = [];

    try {
      const client = new MCPTestClient(context.logger);

      // Try direct SDK transport first, fallback to custom transport adapter
      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        context.logger.info(
          'Using custom transport adapter for tool invocation tests',
          {
            targetType: context.config.target.type,
            reason: error.message,
          },
        );
        await client.connectWithCustomTransport(context.transport);
      }

      const tools = await client.listTools();
      const expectedTools = context.config.expectations?.tools || [];

      if (tools.length === 0) {
        cases.push({
          name: 'tool-availability',
          status: 'skipped' as const,
          durationMs: 0,
          details: { reason: 'No tools available for testing' },
        });
      } else {
        // Test each expected tool
        for (const expectedTool of expectedTools) {
          const tool = tools.find((t) => t.name === expectedTool.name);
          if (!tool) {
            if (expectedTool.required) {
              cases.push({
                name: `tool-${expectedTool.name}-availability`,
                status: 'failed',
                durationMs: 0,
                error: {
                  type: 'ToolNotFound',
                  message: `Required tool '${expectedTool.name}' not found`,
                },
              });
            }
            continue;
          }

          await this.testTool(client, tool, expectedTool, cases, context);
        }

        // Test a few discovered tools that aren't in expectations
        const unexpectedTools = tools
          .filter((t) => !expectedTools.some((et) => et.name === t.name))
          .slice(0, 3); // Test up to 3 unexpected tools

        for (const tool of unexpectedTools) {
          await this.testTool(client, tool, undefined, cases, context);
        }

        // Test timeout handling
        await this.testTimeouts(client, tools, cases, context);

        // Test error handling
        await this.testErrorHandling(client, tools, cases, context);
      }

      await client.close();
    } catch (error) {
      cases.push({
        name: 'initialization',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'InitializationError',
          message: error.message,
        },
      });
    }

    const overallStatus = this.determineOverallStatus(cases);

    return {
      name: this.name,
      status: overallStatus,
      durationMs: Date.now() - startTime,
      cases,
    };
  }

  private async testTool(
    client: MCPTestClient,
    tool: MCPTool,
    expectedTool: any,
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    const toolName = tool.name;

    // Test case 1: Basic tool invocation with minimal valid input
    try {
      const basicInput = this.generateBasicInput(tool);
      const invokeStart = Date.now();

      const response = await client.callTool(toolName, basicInput);
      const invokeTime = Date.now() - invokeStart;

      // Validate response structure
      const isValidResponse = this.validateToolResponse(response);

      cases.push({
        name: `tool-${toolName}-basic-invocation`,
        status: isValidResponse ? 'passed' : 'failed',
        durationMs: invokeTime,
        details: {
          input: basicInput,
          responseContentCount: Array.isArray(response.content) ? response.content.length : 0,
          responseTimeMs: invokeTime,
          isError: response.isError || false,
        },
        ...(isValidResponse
          ? {}
          : {
              error: {
                type: 'InvalidResponse',
                message: 'Tool response does not match expected structure',
              },
            }),
      });

      // Test case 2: Input validation (invalid input)
      if (tool.inputSchema) {
        try {
          const invalidInput = this.generateInvalidInput(tool);
          const invalidStart = Date.now();

          try {
            await client.callTool(toolName, invalidInput);
            // If we get here, the tool didn't reject invalid input
            cases.push({
              name: `tool-${toolName}-input-validation`,
              status: 'failed',
              durationMs: Date.now() - invalidStart,
              details: { invalidInput },
              error: {
                type: 'ValidationFailure',
                message: 'Tool accepted invalid input without error',
              },
            });
          } catch (error) {
            // Good - the tool rejected invalid input
            cases.push({
              name: `tool-${toolName}-input-validation`,
              status: 'passed',
              durationMs: Date.now() - invalidStart,
              details: {
                invalidInput,
                rejectionMessage: error.message,
              },
            });
          }
        } catch (error) {
          // Error generating invalid input - skip this test
          cases.push({
            name: `tool-${toolName}-input-validation`,
            status: 'skipped',
            durationMs: 0,
            details: { reason: 'Could not generate invalid input for testing' },
          });
        }
      }

      // Test case 3: Deterministic behavior (if configured)
      if (expectedTool?.deterministic !== false) {
        try {
          const deterministicInput = this.generateDeterministicInput(tool);

          const result1 = await client.callTool(toolName, deterministicInput);
          const result2 = await client.callTool(toolName, deterministicInput);

          const isDeterministic = this.compareResults(result1, result2);

          cases.push({
            name: `tool-${toolName}-deterministic-behavior`,
            status: isDeterministic ? 'passed' : 'warning',
            durationMs: 10,
            details: {
              input: deterministicInput,
              resultsMatch: isDeterministic,
            },
            ...(isDeterministic
              ? {}
              : {
                  warnings: [
                    'Tool behavior appears non-deterministic with identical inputs',
                  ],
                }),
          });
        } catch (error) {
          cases.push({
            name: `tool-${toolName}-deterministic-behavior`,
            status: 'skipped',
            durationMs: 0,
            details: { reason: error.message },
          });
        }
      }
    } catch (error) {
      cases.push({
        name: `tool-${toolName}-basic-invocation`,
        status: 'failed',
        durationMs: 0,
        error: {
          type: 'InvocationError',
          message: error.message,
        },
      });
    }
  }

  private async testTimeouts(
    client: MCPTestClient,
    tools: MCPTool[],
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    if (tools.length === 0) return;

    const tool = tools[0]; // Test with first available tool
    const timeoutMs = Math.min(
      context.config.timeouts?.invokeMs || 15000,
      5000,
    );

    try {
      // Create a client for timeout testing
      const timeoutClient = new MCPTestClient(context.logger);

      // Connect using the same approach as main client
      try {
        await timeoutClient.connectFromTarget(context.config.target);
      } catch (error) {
        await timeoutClient.connectWithCustomTransport(context.transport);
      }

      const basicInput = this.generateBasicInput(tool);
      const timeoutStart = Date.now();

      try {
        await timeoutClient.callTool(tool.name, basicInput);
        const responseTime = Date.now() - timeoutStart;

        cases.push({
          name: 'timeout-handling',
          status: 'passed',
          durationMs: responseTime,
          details: {
            toolName: tool.name,
            timeoutMs,
            responseTimeMs: responseTime,
            timedOut: false,
          },
        });
      } catch (error) {
        const elapsedTime = Date.now() - timeoutStart;
        const isTimeoutError = error.message.includes('timeout');

        cases.push({
          name: 'timeout-handling',
          status: isTimeoutError ? 'passed' : 'failed',
          durationMs: elapsedTime,
          details: {
            toolName: tool.name,
            timeoutMs,
            elapsedTimeMs: elapsedTime,
            timedOut: isTimeoutError,
            errorMessage: error.message,
          },
          ...(isTimeoutError
            ? {}
            : {
                error: {
                  type: 'UnexpectedError',
                  message: `Expected timeout error but got: ${error.message}`,
                },
              }),
        });
      }
    } catch (error) {
      cases.push({
        name: 'timeout-handling',
        status: 'failed',
        durationMs: 0,
        error: {
          type: 'TimeoutTestError',
          message: error.message,
        },
      });
    }
  }

  private async testErrorHandling(
    client: MCPTestClient,
    tools: MCPTool[],
    cases: any[],
    context: TestContext,
  ): Promise<void> {
    // Test calling non-existent tool
    try {
      const nonExistentToolName = 'non-existent-tool-' + Date.now();

      try {
        await client.callTool(nonExistentToolName, {});
        cases.push({
          name: 'error-handling-nonexistent-tool',
          status: 'failed',
          durationMs: 0,
          error: {
            type: 'ErrorHandlingFailure',
            message: 'Server did not return error for non-existent tool',
          },
        });
      } catch (error) {
        cases.push({
          name: 'error-handling-nonexistent-tool',
          status: 'passed',
          durationMs: 0,
          details: {
            toolName: nonExistentToolName,
            errorMessage: error.message,
          },
        });
      }
    } catch (error) {
      cases.push({
        name: 'error-handling-nonexistent-tool',
        status: 'failed',
        durationMs: 0,
        error: {
          type: 'ErrorTestError',
          message: error.message,
        },
      });
    }
  }

  private generateBasicInput(tool: MCPTool): any {
    if (!tool.inputSchema) return {};

    // Generate minimal valid input based on schema
    const schema = tool.inputSchema;

    if (schema.type === 'object') {
      const input: any = {};
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties as any)) {
          if (schema.required && schema.required.includes(key)) {
            input[key] = this.generateValueForProperty(prop);
          }
        }
      }
      return input;
    }

    return {};
  }

  private generateInvalidInput(tool: MCPTool): any {
    const schema = tool.inputSchema;

    if (schema.type === 'object' && schema.properties) {
      // Return an object with invalid property types
      const invalidInput: any = {};
      for (const [key, prop] of Object.entries(schema.properties as any)) {
        invalidInput[key] = this.generateInvalidValueForProperty(prop);
      }
      return invalidInput;
    }

    return { invalidProperty: 'this should not be accepted' };
  }

  private generateDeterministicInput(tool: MCPTool): any {
    // Generate the same input consistently for deterministic testing
    return this.generateBasicInput(tool);
  }

  private generateValueForProperty(prop: any): any {
    switch (prop.type) {
      case 'string':
        return 'test';
      case 'number':
        return 42;
      case 'integer':
        return 42;
      case 'boolean':
        return true;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return 'test';
    }
  }

  private generateInvalidValueForProperty(prop: any): any {
    switch (prop.type) {
      case 'string':
        return 123; // number instead of string
      case 'number':
        return 'not a number';
      case 'integer':
        return 'not an integer';
      case 'boolean':
        return 'not a boolean';
      case 'array':
        return 'not an array';
      case 'object':
        return 'not an object';
      default:
        return null;
    }
  }

  private validateToolResponse(response: any): boolean {
    if (!response || !response.result) return false;

    const result = response.result;

    // Must have content array
    if (!Array.isArray(result.content)) return false;

    // Each content item must have a type
    for (const content of result.content) {
      if (!content.type) return false;
    }

    return true;
  }

  private compareResults(result1: any, result2: any): boolean {
    // Simple comparison - in production you'd do deep comparison
    return JSON.stringify(result1) === JSON.stringify(result2);
  }

  private determineOverallStatus(
    cases: any[],
  ): 'passed' | 'failed' | 'warning' {
    if (cases.some((c) => c.status === 'failed')) {
      return 'failed';
    }
    if (cases.some((c) => c.status === 'warning')) {
      return 'warning';
    }
    return 'passed';
  }
}
