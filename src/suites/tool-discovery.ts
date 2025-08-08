/**
 * Tool discovery test suite - validates tool enumeration and schema compliance
 */

import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
} from '../types/test';
import { CheckConfig } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';

export class ToolDiscoveryTestSuite implements TestSuitePlugin {
  readonly name = 'tool-discovery';
  readonly version = '1.0.0';
  readonly description =
    'Validates tool enumeration and schema definition compliance';
  readonly tags = ['core', 'tools'];

  validate(config: Partial<CheckConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.target) {
      errors.push('Target configuration is required');
    }

    if (config.expectations?.tools?.length === 0) {
      warnings.push('No tools expected - tool discovery tests may be limited');
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
      const client = new MCPTestClient(context.transport, context.logger);
      await client.initialize();

      // Test case 1: Tool enumeration
      try {
        const toolsStart = Date.now();
        const tools = await client.listTools();
        const toolsTime = Date.now() - toolsStart;

        cases.push({
          name: 'tool-enumeration',
          status: 'passed' as const,
          durationMs: toolsTime,
          details: {
            toolCount: tools.length,
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
            })),
            responseTimeMs: toolsTime,
          },
        });

        // Test case 2: Required tools validation
        const expectedTools = context.config.expectations?.tools || [];
        const requiredTools = expectedTools.filter((t) => t.required);
        const foundTools = tools.map((t) => t.name);
        const missingRequiredTools = requiredTools.filter(
          (rt) => !foundTools.includes(rt.name),
        );

        cases.push({
          name: 'required-tools-validation',
          status: missingRequiredTools.length === 0 ? 'passed' : 'failed',
          durationMs: 5,
          details: {
            requiredTools: requiredTools.map((t) => t.name),
            foundTools,
            missingRequiredTools: missingRequiredTools.map((t) => t.name),
          },
          ...(missingRequiredTools.length > 0
            ? {
                error: {
                  type: 'MissingRequiredTools',
                  message: `Missing required tools: ${missingRequiredTools.map((t) => t.name).join(', ')}`,
                  details: { missingRequiredTools },
                },
              }
            : {}),
        });

        // Test case 3: Tool schema validation
        let schemaErrors = 0;
        const schemaDetails: any = { validSchemas: [], invalidSchemas: [] };

        for (const tool of tools) {
          try {
            this.validateToolSchema(tool);
            schemaDetails.validSchemas.push(tool.name);
          } catch (error) {
            schemaErrors++;
            schemaDetails.invalidSchemas.push({
              name: tool.name,
              error: error.message,
            });
          }
        }

        cases.push({
          name: 'tool-schema-validation',
          status: schemaErrors === 0 ? 'passed' : 'failed',
          durationMs: 10,
          details: schemaDetails,
          ...(schemaErrors > 0
            ? {
                error: {
                  type: 'InvalidToolSchemas',
                  message: `${schemaErrors} tools have invalid schemas`,
                  details: schemaDetails,
                },
              }
            : {}),
        });

        // Test case 4: Unique tool names
        const toolNames = tools.map((t) => t.name);
        const duplicateNames = this.findDuplicates(toolNames);

        cases.push({
          name: 'unique-tool-names',
          status: duplicateNames.length === 0 ? 'passed' : 'failed',
          durationMs: 5,
          details: {
            toolNames,
            duplicateNames,
          },
          ...(duplicateNames.length > 0
            ? {
                error: {
                  type: 'DuplicateToolNames',
                  message: `Duplicate tool names found: ${duplicateNames.join(', ')}`,
                  details: { duplicateNames },
                },
              }
            : {}),
        });

        // Test case 5: Tool description quality
        const toolsWithoutDescription = tools.filter(
          (t) => !t.description || t.description.trim().length === 0,
        );
        const hasDescriptionIssues = toolsWithoutDescription.length > 0;

        cases.push({
          name: 'tool-description-quality',
          status: hasDescriptionIssues ? 'warning' : 'passed',
          durationMs: 5,
          details: {
            totalTools: tools.length,
            toolsWithDescription: tools.length - toolsWithoutDescription.length,
            toolsWithoutDescription: toolsWithoutDescription.map((t) => t.name),
          },
          ...(hasDescriptionIssues
            ? {
                warnings: [
                  `${toolsWithoutDescription.length} tools lack descriptions`,
                ],
              }
            : {}),
        });
      } catch (error) {
        cases.push({
          name: 'tool-enumeration',
          status: 'failed',
          durationMs: 0,
          error: {
            type: 'ToolListError',
            message: error.message,
          },
        });
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

  private validateToolSchema(tool: any): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }

    if (!tool.inputSchema) {
      throw new Error('Tool inputSchema is required');
    }

    if (typeof tool.inputSchema !== 'object') {
      throw new Error('Tool inputSchema must be an object');
    }

    // Basic JSON Schema validation
    if (
      !tool.inputSchema.type &&
      !tool.inputSchema.properties &&
      !tool.inputSchema.$ref
    ) {
      throw new Error('Tool inputSchema must have type, properties, or $ref');
    }

    // Check for common schema issues
    if (tool.inputSchema.type === 'object' && !tool.inputSchema.properties) {
      throw new Error('Object type schemas should define properties');
    }
  }

  private findDuplicates(array: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const item of array) {
      if (seen.has(item)) {
        duplicates.add(item);
      } else {
        seen.add(item);
      }
    }

    return Array.from(duplicates);
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
