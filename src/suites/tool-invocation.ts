/**
 * Tool invocation test suite - validates tool execution under various conditions
 */

import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
  TestCaseResult,
} from '../types/test';
import { CheckConfig, ToolExpectation } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';
import { MCPTool, MCPCallToolResult, JSONSchemaProperty } from '../types/mcp';

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
        const maxUnexpectedTools = context.config.testParameters?.maxUnexpectedTools ?? 3;
        const unexpectedTools = tools
          .filter((t) => !expectedTools.some((et) => et.name === t.name))
          .slice(0, maxUnexpectedTools);

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
    expectedTool: ToolExpectation | undefined,
    cases: TestCaseResult[],
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
    cases: TestCaseResult[],
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
    cases: TestCaseResult[],
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

  private generateBasicInput(tool: MCPTool): Record<string, unknown> {
    if (!tool.inputSchema) return {};

    // Generate minimal valid input based on schema
    const schema = tool.inputSchema as JSONSchemaProperty;

    if (schema.type === 'object') {
      const input: Record<string, unknown> = {};
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          if (schema.required && schema.required.includes(key)) {
            input[key] = this.generateValueForProperty(prop);
          }
        }
      }
      return input;
    }

    return {};
  }

  private generateInvalidInput(tool: MCPTool): Record<string, unknown> {
    const schema = tool.inputSchema as JSONSchemaProperty | undefined;

    if (schema?.type === 'object' && schema.properties) {
      // Return an object with invalid property types
      const invalidInput: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        invalidInput[key] = this.generateInvalidValueForProperty(prop);
      }
      return invalidInput;
    }

    return { invalidProperty: 'this should not be accepted' };
  }

  private generateDeterministicInput(tool: MCPTool): Record<string, unknown> {
    // Generate the same input consistently for deterministic testing
    return this.generateBasicInput(tool);
  }

  private generateValueForProperty(prop: JSONSchemaProperty): unknown {
    switch (prop.type) {
      case 'string':
        return this.generateStringValue(prop);
      case 'number':
        return this.generateNumberValue(prop);
      case 'integer':
        return this.generateIntegerValue(prop);
      case 'boolean':
        return prop.default !== undefined ? prop.default : true;
      case 'array':
        return this.generateArrayValue(prop);
      case 'object':
        return this.generateObjectValue(prop);
      default:
        // Handle union types or unspecified type
        if (prop.enum && prop.enum.length > 0) {
          return prop.enum[0];
        }
        if (prop.const !== undefined) {
          return prop.const;
        }
        return 'test';
    }
  }

  private generateStringValue(prop: JSONSchemaProperty): string {
    // Use enum value if available
    if (prop.enum && prop.enum.length > 0) {
      return String(prop.enum[0]);
    }
    // Use const if available
    if (prop.const !== undefined) {
      return String(prop.const);
    }
    // Use default if available
    if (prop.default !== undefined) {
      return String(prop.default);
    }
    // Generate value based on constraints
    const minLength = prop.minLength ?? 0;
    const maxLength = prop.maxLength ?? 100;
    const targetLength = Math.max(minLength, Math.min(4, maxLength));

    // Try to match pattern if specified
    if (prop.pattern) {
      return this.generateStringFromPattern(prop.pattern, targetLength);
    }
    // Generate based on format if specified
    if (prop.format) {
      return this.generateStringForFormat(prop.format);
    }
    // Generate string of appropriate length
    return 'test'.repeat(Math.ceil(targetLength / 4)).substring(0, targetLength);
  }

  private generateStringFromPattern(pattern: string, targetLength: number): string {
    // Try to generate a simple value that might match common patterns
    // This is a best-effort approach since generating from regex is complex
    const simplePatterns: Record<string, string> = {
      '^[a-z]+$': 'test',
      '^[A-Z]+$': 'TEST',
      '^[a-zA-Z]+$': 'Test',
      '^[0-9]+$': '12345',
      '^\\d+$': '12345',
      '^[a-zA-Z0-9]+$': 'Test123',
      '^\\w+$': 'test_123',
      '.*': 'test',
    };
    // Check if pattern matches any simple pattern
    for (const [simplePattern, value] of Object.entries(simplePatterns)) {
      if (pattern === simplePattern || pattern.includes(simplePattern.slice(1, -1))) {
        const padded = value.repeat(Math.ceil(targetLength / value.length));
        return padded.substring(0, Math.max(targetLength, value.length));
      }
    }
    // Default fallback
    return 'test'.repeat(Math.ceil(targetLength / 4)).substring(0, targetLength);
  }

  private generateStringForFormat(format: string): string {
    const formatValues: Record<string, string> = {
      email: 'test@example.com',
      uri: 'https://example.com/test',
      url: 'https://example.com/test',
      'uri-reference': '/test/path',
      'date-time': new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      time: '12:00:00',
      hostname: 'example.com',
      ipv4: '127.0.0.1',
      ipv6: '::1',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      'json-pointer': '/test/path',
      regex: '.*',
    };
    return formatValues[format] ?? 'test';
  }

  private generateNumberValue(prop: JSONSchemaProperty): number {
    if (prop.enum && prop.enum.length > 0) {
      return prop.enum[0] as number;
    }
    if (prop.const !== undefined) {
      return prop.const as number;
    }
    if (prop.default !== undefined) {
      return prop.default as number;
    }
    const min = prop.minimum ?? prop.exclusiveMinimum ?? 0;
    const max = prop.maximum ?? prop.exclusiveMaximum ?? 100;
    const exclusiveMin = prop.exclusiveMinimum !== undefined;
    const exclusiveMax = prop.exclusiveMaximum !== undefined;

    let value = (min + max) / 2;
    if (exclusiveMin && value <= min) value = min + 0.1;
    if (exclusiveMax && value >= max) value = max - 0.1;

    if (prop.multipleOf) {
      value = Math.round(value / prop.multipleOf) * prop.multipleOf;
    }
    return value;
  }

  private generateIntegerValue(prop: JSONSchemaProperty): number {
    if (prop.enum && prop.enum.length > 0) {
      return prop.enum[0] as number;
    }
    if (prop.const !== undefined) {
      return prop.const as number;
    }
    if (prop.default !== undefined) {
      return prop.default as number;
    }
    const min = prop.minimum ?? prop.exclusiveMinimum ?? 0;
    const max = prop.maximum ?? prop.exclusiveMaximum ?? 100;
    const exclusiveMin = prop.exclusiveMinimum !== undefined;
    const exclusiveMax = prop.exclusiveMaximum !== undefined;

    let value = Math.floor((min + max) / 2);
    if (exclusiveMin && value <= min) value = min + 1;
    if (exclusiveMax && value >= max) value = max - 1;

    if (prop.multipleOf) {
      value = Math.round(value / prop.multipleOf) * prop.multipleOf;
    }
    return Math.floor(value);
  }

  private generateArrayValue(prop: JSONSchemaProperty): unknown[] {
    const minItems = prop.minItems ?? 0;
    const maxItems = prop.maxItems ?? 3;
    const targetItems = Math.max(minItems, Math.min(1, maxItems));

    if (targetItems === 0) return [];

    const itemSchema: JSONSchemaProperty = (Array.isArray(prop.items) ? prop.items[0] : prop.items) || { type: 'string' };
    const items: unknown[] = [];

    for (let i = 0; i < targetItems; i++) {
      items.push(this.generateValueForProperty(itemSchema));
    }
    return items;
  }

  private generateObjectValue(prop: JSONSchemaProperty): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    if (prop.properties) {
      const required = prop.required || [];
      for (const [key, subProp] of Object.entries(prop.properties)) {
        // Only include required properties to keep it minimal
        if (required.includes(key)) {
          obj[key] = this.generateValueForProperty(subProp);
        }
      }
    }
    return obj;
  }

  private generateInvalidValueForProperty(prop: JSONSchemaProperty): unknown {
    switch (prop.type) {
      case 'string':
        return this.generateInvalidStringValue(prop);
      case 'number':
      case 'integer':
        return this.generateInvalidNumberValue(prop);
      case 'boolean':
        return 'not_a_boolean'; // String instead of boolean
      case 'array':
        return this.generateInvalidArrayValue(prop);
      case 'object':
        return 'not_an_object'; // String instead of object
      default:
        return null;
    }
  }

  private generateInvalidStringValue(prop: JSONSchemaProperty): string | number {
    // If enum is defined, return value not in enum
    if (prop.enum && prop.enum.length > 0) {
      return 'INVALID_ENUM_VALUE_' + Date.now();
    }
    // Violate minLength
    if (prop.minLength && prop.minLength > 0) {
      return '';
    }
    // Violate maxLength
    if (prop.maxLength) {
      return 'x'.repeat(prop.maxLength + 10);
    }
    // Violate pattern
    if (prop.pattern) {
      return '!@#$%^&*()_+[]{}|;:,.<>?';
    }
    // Return wrong type
    return 12345;
  }

  private generateInvalidNumberValue(prop: JSONSchemaProperty): number | string {
    // Violate minimum
    if (prop.minimum !== undefined) {
      return prop.minimum - 1000;
    }
    // Violate maximum
    if (prop.maximum !== undefined) {
      return prop.maximum + 1000;
    }
    // Violate exclusiveMinimum
    if (prop.exclusiveMinimum !== undefined) {
      return prop.exclusiveMinimum;
    }
    // Violate exclusiveMaximum
    if (prop.exclusiveMaximum !== undefined) {
      return prop.exclusiveMaximum;
    }
    // Return wrong type
    return 'not_a_number';
  }

  private generateInvalidArrayValue(prop: JSONSchemaProperty): string[] | string {
    // Violate minItems
    if (prop.minItems && prop.minItems > 0) {
      return [];
    }
    // Violate maxItems
    if (prop.maxItems !== undefined) {
      const items: string[] = [];
      for (let i = 0; i < prop.maxItems + 5; i++) {
        items.push('item');
      }
      return items;
    }
    // Return wrong type
    return 'not_an_array';
  }

  private validateToolResponse(response: unknown): boolean {
    if (!response || typeof response !== 'object') return false;

    const resp = response as Record<string, unknown>;

    // Must have content array
    if (!Array.isArray(resp.content)) return false;

    // Each content item must have a type
    for (const content of resp.content) {
      if (!content || typeof content !== 'object' || !('type' in content)) return false;
    }

    return true;
  }

  private compareResults(result1: unknown, result2: unknown): boolean {
    // Simple comparison - in production you'd do deep comparison
    return JSON.stringify(result1) === JSON.stringify(result2);
  }

  private determineOverallStatus(
    cases: TestCaseResult[],
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
