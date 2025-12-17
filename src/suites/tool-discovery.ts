/**
 * Tool discovery test suite - validates tool enumeration and schema compliance
 */

import Ajv, { ErrorObject } from 'ajv';
import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
} from '../types/test';
import { CheckConfig } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';

// JSON Schema meta-schema for validating tool input schemas (simplified)
// Note: $id removed to avoid duplicate schema registration in tests
const JSON_SCHEMA_META = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'MCP Tool Schema Validator',
  definitions: {
    schemaArray: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#' },
    },
    nonNegativeInteger: {
      type: 'integer',
      minimum: 0,
    },
    nonNegativeIntegerDefault0: {
      allOf: [{ $ref: '#/definitions/nonNegativeInteger' }, { default: 0 }],
    },
    simpleTypes: {
      enum: ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'],
    },
    stringArray: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      default: [],
    },
  },
  type: ['object', 'boolean'],
  properties: {
    $id: { type: 'string', format: 'uri-reference' },
    $schema: { type: 'string', format: 'uri' },
    $ref: { type: 'string', format: 'uri-reference' },
    $comment: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    default: true,
    readOnly: { type: 'boolean', default: false },
    examples: { type: 'array', items: true },
    multipleOf: { type: 'number', exclusiveMinimum: 0 },
    maximum: { type: 'number' },
    exclusiveMaximum: { type: 'number' },
    minimum: { type: 'number' },
    exclusiveMinimum: { type: 'number' },
    maxLength: { $ref: '#/definitions/nonNegativeInteger' },
    minLength: { $ref: '#/definitions/nonNegativeIntegerDefault0' },
    pattern: { type: 'string', format: 'regex' },
    additionalItems: { $ref: '#' },
    items: {
      anyOf: [{ $ref: '#' }, { $ref: '#/definitions/schemaArray' }],
      default: true,
    },
    maxItems: { $ref: '#/definitions/nonNegativeInteger' },
    minItems: { $ref: '#/definitions/nonNegativeIntegerDefault0' },
    uniqueItems: { type: 'boolean', default: false },
    contains: { $ref: '#' },
    maxProperties: { $ref: '#/definitions/nonNegativeInteger' },
    minProperties: { $ref: '#/definitions/nonNegativeIntegerDefault0' },
    required: { $ref: '#/definitions/stringArray' },
    additionalProperties: { $ref: '#' },
    definitions: {
      type: 'object',
      additionalProperties: { $ref: '#' },
      default: {},
    },
    properties: {
      type: 'object',
      additionalProperties: { $ref: '#' },
      default: {},
    },
    patternProperties: {
      type: 'object',
      additionalProperties: { $ref: '#' },
      propertyNames: { format: 'regex' },
      default: {},
    },
    dependencies: {
      type: 'object',
      additionalProperties: {
        anyOf: [{ $ref: '#' }, { $ref: '#/definitions/stringArray' }],
      },
    },
    propertyNames: { $ref: '#' },
    const: true,
    enum: { type: 'array', items: true, minItems: 1, uniqueItems: true },
    type: {
      anyOf: [
        { $ref: '#/definitions/simpleTypes' },
        {
          type: 'array',
          items: { $ref: '#/definitions/simpleTypes' },
          minItems: 1,
          uniqueItems: true,
        },
      ],
    },
    format: { type: 'string' },
    contentMediaType: { type: 'string' },
    contentEncoding: { type: 'string' },
    if: { $ref: '#' },
    then: { $ref: '#' },
    else: { $ref: '#' },
    allOf: { $ref: '#/definitions/schemaArray' },
    anyOf: { $ref: '#/definitions/schemaArray' },
    oneOf: { $ref: '#/definitions/schemaArray' },
    not: { $ref: '#' },
  },
  default: true,
};

export class ToolDiscoveryTestSuite implements TestSuitePlugin {
  readonly name = 'tool-discovery';
  readonly version = '1.0.0';
  readonly description =
    'Validates tool enumeration and schema definition compliance';
  readonly tags = ['core', 'tools'];

  private ajv: Ajv;
  private schemaValidator: ReturnType<Ajv['compile']>;

  constructor() {
    // Initialize AJV with strict mode disabled for broader compatibility
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: false,
    });

    // Compile the meta-schema validator
    this.schemaValidator = this.ajv.compile(JSON_SCHEMA_META);
  }

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
      const client = new MCPTestClient(context.logger);

      // Connect using SDK approach
      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        context.logger.info(
          'Using custom transport adapter for tool discovery tests',
          {
            targetType: context.config.target.type,
            reason: error.message,
          },
        );
        await client.connectWithCustomTransport(context.transport);
      }

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

        // Test case 3: Tool schema validation (using AJV)
        let schemaErrors = 0;
        const schemaDetails: any = { validSchemas: [], invalidSchemas: [] };

        for (const tool of tools) {
          const validation = this.validateToolSchema(tool);
          if (validation.valid) {
            schemaDetails.validSchemas.push(tool.name);
          } else {
            schemaErrors++;
            schemaDetails.invalidSchemas.push({
              name: tool.name,
              errors: validation.errors,
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

  private validateToolSchema(tool: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic structure validation
    if (!tool.name || typeof tool.name !== 'string') {
      errors.push('Tool name is required and must be a string');
    }

    if (!tool.inputSchema) {
      errors.push('Tool inputSchema is required');
      return { valid: false, errors };
    }

    if (typeof tool.inputSchema !== 'object') {
      errors.push('Tool inputSchema must be an object');
      return { valid: false, errors };
    }

    // Validate inputSchema against JSON Schema meta-schema using AJV
    const isValidSchema = this.schemaValidator(tool.inputSchema);
    if (!isValidSchema && this.schemaValidator.errors) {
      for (const error of this.schemaValidator.errors) {
        const path = error.instancePath || 'root';
        errors.push(`Schema validation error at ${path}: ${error.message}`);
      }
    }

    // Additional semantic checks for MCP tool schemas
    const schema = tool.inputSchema;

    // Check that schema has meaningful structure
    if (!schema.type && !schema.properties && !schema.$ref && !schema.oneOf && !schema.anyOf && !schema.allOf) {
      errors.push('Tool inputSchema should have type, properties, $ref, or composition keywords (oneOf/anyOf/allOf)');
    }

    // Validate type is appropriate for tool input
    if (schema.type && !['object', 'array', 'string', 'number', 'integer', 'boolean'].includes(schema.type)) {
      errors.push(`Invalid schema type: ${schema.type}`);
    }

    // Check for object schemas without properties (warning-level, but still flagged)
    if (schema.type === 'object' && !schema.properties && !schema.additionalProperties && !schema.$ref) {
      errors.push('Object type schemas should define properties or additionalProperties');
    }

    // Validate property schemas recursively
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propErrors = this.validatePropertySchema(propName, propSchema as any);
        errors.push(...propErrors);
      }
    }

    // Validate required array
    if (schema.required) {
      if (!Array.isArray(schema.required)) {
        errors.push('Schema "required" must be an array');
      } else if (schema.properties) {
        const propertyNames = Object.keys(schema.properties);
        for (const reqProp of schema.required) {
          if (!propertyNames.includes(reqProp)) {
            errors.push(`Required property "${reqProp}" not defined in properties`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validatePropertySchema(propName: string, schema: any): string[] {
    const errors: string[] = [];

    if (!schema || typeof schema !== 'object') {
      errors.push(`Property "${propName}" has invalid schema`);
      return errors;
    }

    // Check for valid type
    if (schema.type) {
      const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
      if (Array.isArray(schema.type)) {
        for (const t of schema.type) {
          if (!validTypes.includes(t)) {
            errors.push(`Property "${propName}" has invalid type: ${t}`);
          }
        }
      } else if (!validTypes.includes(schema.type)) {
        errors.push(`Property "${propName}" has invalid type: ${schema.type}`);
      }
    }

    // Validate string constraints
    if (schema.type === 'string') {
      if (schema.minLength !== undefined && schema.maxLength !== undefined) {
        if (schema.minLength > schema.maxLength) {
          errors.push(`Property "${propName}": minLength (${schema.minLength}) > maxLength (${schema.maxLength})`);
        }
      }
      if (schema.pattern) {
        try {
          new RegExp(schema.pattern);
        } catch (e) {
          errors.push(`Property "${propName}": invalid regex pattern "${schema.pattern}"`);
        }
      }
    }

    // Validate number constraints
    if (schema.type === 'number' || schema.type === 'integer') {
      if (schema.minimum !== undefined && schema.maximum !== undefined) {
        if (schema.minimum > schema.maximum) {
          errors.push(`Property "${propName}": minimum (${schema.minimum}) > maximum (${schema.maximum})`);
        }
      }
    }

    // Validate array constraints
    if (schema.type === 'array') {
      if (schema.minItems !== undefined && schema.maxItems !== undefined) {
        if (schema.minItems > schema.maxItems) {
          errors.push(`Property "${propName}": minItems (${schema.minItems}) > maxItems (${schema.maxItems})`);
        }
      }
    }

    // Validate enum values
    if (schema.enum) {
      if (!Array.isArray(schema.enum)) {
        errors.push(`Property "${propName}": enum must be an array`);
      } else if (schema.enum.length === 0) {
        errors.push(`Property "${propName}": enum cannot be empty`);
      }
    }

    return errors;
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
