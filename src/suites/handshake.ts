/**
 * Handshake test suite - validates MCP protocol initialization using official SDK
 */

import {
  TestSuitePlugin,
  TestContext,
  TestSuiteResult,
  ValidationResult,
} from '../types/test';
import { CheckConfig } from '../types/config';
import { MCPTestClient } from '../core/mcp-client';

export class HandshakeTestSuite implements TestSuitePlugin {
  readonly name = 'handshake';
  readonly version = '1.0.0';
  readonly description =
    'Validates MCP protocol handshake and capability negotiation using official SDK';
  readonly tags = ['core', 'protocol'];

  validate(config: Partial<CheckConfig>): ValidationResult {
    const errors: string[] = [];

    if (!config.target) {
      errors.push('Target configuration is required');
    }

    if (
      config.expectations?.minProtocolVersion &&
      !this.isValidVersion(config.expectations.minProtocolVersion)
    ) {
      errors.push('Invalid minProtocolVersion format');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async execute(context: TestContext): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const cases = [];

    // Test case 1: Basic connection establishment using SDK
    try {
      const client = new MCPTestClient(context.logger);

      const connectionStart = Date.now();

      // Try direct SDK transport first (if supported)
      try {
        await client.connectFromTarget(context.config.target);
      } catch (error) {
        // Fallback to custom transport adapter for unsupported transports (like TCP)
        context.logger.info('Using custom transport adapter', {
          targetType: context.config.target.type,
          reason: error.message,
        });
        await client.connectWithCustomTransport(context.transport);
      }

      const connectionTime = Date.now() - connectionStart;

      // Get server info from SDK client
      const serverCapabilities = client.getServerCapabilities();
      const serverVersion = client.getServerVersion();

      cases.push({
        name: 'connection-establishment',
        status: 'passed' as const,
        durationMs: connectionTime,
        details: {
          serverInfo: serverVersion,
          protocolVersion: 'SDK-managed', // SDK handles protocol version
          serverCapabilities,
          connectionTimeMs: connectionTime,
          sdkVersion: '1.17.2', // Track SDK version for debugging
        },
      });

      // Test case 2: Server capabilities validation
      try {
        const capabilitiesValid = this.validateServerCapabilities(
          serverCapabilities,
          context.config.expectations,
        );

        cases.push({
          name: 'server-capabilities-validation',
          status: capabilitiesValid.valid ? 'passed' : 'failed',
          durationMs: 5,
          details: {
            serverCapabilities,
            validation: capabilitiesValid,
          },
          ...(capabilitiesValid.valid
            ? {}
            : {
                error: {
                  type: 'CapabilitiesMismatch',
                  message:
                    capabilitiesValid.errors?.join(', ') ||
                    'Unknown validation error',
                  details: capabilitiesValid,
                },
              }),
        });
      } catch (error) {
        cases.push({
          name: 'server-capabilities-validation',
          status: 'failed',
          durationMs: 5,
          error: {
            type: 'ValidationError',
            message: `Failed to validate server capabilities: ${error.message}`,
            details: { error: error.message },
          },
        });
      }

      // Test case 3: Basic ping test using SDK
      try {
        const pingStart = Date.now();
        await client.ping();
        const pingTime = Date.now() - pingStart;

        cases.push({
          name: 'ping-test',
          status: 'passed' as const,
          durationMs: pingTime,
          details: {
            responseTimeMs: pingTime,
          },
        });
      } catch (error) {
        cases.push({
          name: 'ping-test',
          status: 'failed',
          durationMs: Date.now() - Date.now(),
          error: {
            type: 'PingError',
            message: `Ping failed: ${error.message}`,
            details: { error: error.message },
          },
        });
      }

      // Test case 4: Tool discovery (if supported)
      if (serverCapabilities?.tools) {
        try {
          const toolsStart = Date.now();
          const tools = await client.listTools();
          const toolsTime = Date.now() - toolsStart;

          cases.push({
            name: 'tool-discovery',
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
        } catch (error) {
          cases.push({
            name: 'tool-discovery',
            status: 'failed',
            durationMs: 50,
            error: {
              type: 'ToolDiscoveryError',
              message: `Tool discovery failed: ${error.message}`,
              details: { error: error.message },
            },
          });
        }
      }

      // Test case 5: Resource discovery (if supported)
      if (serverCapabilities?.resources) {
        try {
          const resourcesStart = Date.now();
          const resources = await client.listResources();
          const resourcesTime = Date.now() - resourcesStart;

          cases.push({
            name: 'resource-discovery',
            status: 'passed' as const,
            durationMs: resourcesTime,
            details: {
              resourceCount: resources.length,
              resources: resources.map((r) => ({ uri: r.uri, name: r.name })),
              responseTimeMs: resourcesTime,
            },
          });
        } catch (error) {
          cases.push({
            name: 'resource-discovery',
            status: 'failed',
            durationMs: 50,
            error: {
              type: 'ResourceDiscoveryError',
              message: `Resource discovery failed: ${error.message}`,
              details: { error: error.message },
            },
          });
        }
      }

      // Test case 6: Prompt discovery (if supported)
      if (serverCapabilities?.prompts) {
        try {
          const promptsStart = Date.now();
          const prompts = await client.listPrompts();
          const promptsTime = Date.now() - promptsStart;

          cases.push({
            name: 'prompt-discovery',
            status: 'passed' as const,
            durationMs: promptsTime,
            details: {
              promptCount: prompts.length,
              prompts: prompts.map((p) => ({
                name: p.name,
                description: p.description,
              })),
              responseTimeMs: promptsTime,
            },
          });
        } catch (error) {
          cases.push({
            name: 'prompt-discovery',
            status: 'failed',
            durationMs: 50,
            error: {
              type: 'PromptDiscoveryError',
              message: `Prompt discovery failed: ${error.message}`,
              details: { error: error.message },
            },
          });
        }
      }

      // Clean up
      await client.close();
    } catch (error) {
      context.logger.error('Handshake test suite failed', {
        error: error.message,
      });

      cases.push({
        name: 'connection-establishment',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ConnectionError',
          message: `Failed to establish connection: ${error.message}`,
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

  private validateServerCapabilities(
    capabilities: any,
    expectations?: any,
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Add capability validation logic here
    if (expectations?.requireTools && !capabilities?.tools) {
      errors.push('Server does not support tools but they are required');
    }

    if (expectations?.requireResources && !capabilities?.resources) {
      errors.push('Server does not support resources but they are required');
    }

    if (expectations?.requirePrompts && !capabilities?.prompts) {
      errors.push('Server does not support prompts but they are required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private isValidVersion(version: string): boolean {
    // Simple version validation - you can enhance this
    return /^\d{4}-\d{2}-\d{2}$/.test(version);
  }
}
