/**
 * Handshake test suite - validates MCP protocol initialization
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
    'Validates MCP protocol handshake and capability negotiation';
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

    // Test case 1: Basic connection establishment
    try {
      const client = new MCPTestClient(context.transport, context.logger);

      const connectionStart = Date.now();
      const response = await client.initialize();
      const connectionTime = Date.now() - connectionStart;

      cases.push({
        name: 'connection-establishment',
        status: 'passed' as const,
        durationMs: connectionTime,
        details: {
          serverInfo: response.result.serverInfo,
          protocolVersion: response.result.protocolVersion,
          connectionTimeMs: connectionTime,
        },
      });

      // Test case 2: Protocol version validation
      try {
        const serverVersion = response.result.protocolVersion;
        const minVersion = context.config.expectations?.minProtocolVersion;
        const maxVersion = context.config.expectations?.maxProtocolVersion;

        let versionValid = true;
        let versionDetails: any = { serverVersion };

        if (
          minVersion &&
          !this.isVersionCompatible(serverVersion, minVersion, 'min')
        ) {
          versionValid = false;
          versionDetails.error = `Server version ${serverVersion} is below minimum ${minVersion}`;
        }

        if (
          maxVersion &&
          !this.isVersionCompatible(serverVersion, maxVersion, 'max')
        ) {
          versionValid = false;
          versionDetails.error = `Server version ${serverVersion} is above maximum ${maxVersion}`;
        }

        cases.push({
          name: 'protocol-version-validation',
          status: versionValid ? 'passed' : 'failed',
          durationMs: 5,
          details: versionDetails,
          ...(versionValid
            ? {}
            : {
                error: {
                  type: 'VersionMismatch',
                  message: versionDetails.error,
                  details: versionDetails,
                },
              }),
        });
      } catch (error) {
        cases.push({
          name: 'protocol-version-validation',
          status: 'failed',
          durationMs: 5,
          error: {
            type: 'ValidationError',
            message: error.message,
          },
        });
      }

      // Test case 3: Capability negotiation
      try {
        const serverCapabilities = response.result.capabilities;
        const expectedCapabilities =
          context.config.expectations?.capabilities || [];

        const missingCapabilities = expectedCapabilities.filter(
          (cap) => !this.hasCapability(serverCapabilities, cap),
        );

        const capabilityDetails = {
          serverCapabilities,
          expectedCapabilities,
          missingCapabilities,
        };

        cases.push({
          name: 'capability-negotiation',
          status: missingCapabilities.length === 0 ? 'passed' : 'failed',
          durationMs: 10,
          details: capabilityDetails,
          ...(missingCapabilities.length > 0
            ? {
                error: {
                  type: 'MissingCapabilities',
                  message: `Missing capabilities: ${missingCapabilities.join(', ')}`,
                  details: capabilityDetails,
                },
              }
            : {}),
        });
      } catch (error) {
        cases.push({
          name: 'capability-negotiation',
          status: 'failed',
          durationMs: 10,
          error: {
            type: 'CapabilityError',
            message: error.message,
          },
        });
      }

      // Test case 4: Ping/pong basic communication
      try {
        const pingStart = Date.now();
        await client.ping();
        const pingTime = Date.now() - pingStart;

        cases.push({
          name: 'ping-pong-communication',
          status: 'passed',
          durationMs: pingTime,
          details: {
            pingTimeMs: pingTime,
          },
        });
      } catch (error) {
        cases.push({
          name: 'ping-pong-communication',
          status: 'failed',
          durationMs: 0,
          error: {
            type: 'PingError',
            message: error.message,
          },
        });
      }

      await client.close();
    } catch (error) {
      cases.push({
        name: 'connection-establishment',
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: {
          type: 'ConnectionError',
          message: error.message,
        },
      });
    }

    const overallStatus = cases.some((c) => c.status === 'failed')
      ? 'failed'
      : 'passed';

    return {
      name: this.name,
      status: overallStatus,
      durationMs: Date.now() - startTime,
      cases,
    };
  }

  private isValidVersion(version: string): boolean {
    // Simple semantic version validation
    return /^\d+\.\d+\.\d+/.test(version);
  }

  private isVersionCompatible(
    serverVersion: string,
    compareVersion: string,
    type: 'min' | 'max',
  ): boolean {
    // Simple version comparison - in production you'd use semver
    const serverParts = serverVersion.split('.').map(Number);
    const compareParts = compareVersion.split('.').map(Number);

    for (
      let i = 0;
      i < Math.max(serverParts.length, compareParts.length);
      i++
    ) {
      const serverPart = serverParts[i] || 0;
      const comparePart = compareParts[i] || 0;

      if (serverPart > comparePart) {
        return type === 'min' ? true : false;
      } else if (serverPart < comparePart) {
        return type === 'min' ? false : true;
      }
    }

    return true; // Equal versions are compatible
  }

  private hasCapability(capabilities: any, capability: string): boolean {
    if (!capabilities || typeof capabilities !== 'object') {
      return false;
    }

    // Check if capability exists as a top-level key
    return capability in capabilities;
  }
}
