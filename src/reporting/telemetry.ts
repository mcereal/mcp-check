/**
 * Telemetry integration for optional monitoring and analytics
 */

import { TelemetryData, RedactionConfig } from '../types/reporting';
import { TestResults } from '../types/test';
import { ReportingConfig } from '../types/config';
import { Logger } from '../types/reporting';

export interface TelemetryProvider {
  name: string;
  send(data: TelemetryData): Promise<void>;
  isEnabled(): boolean;
}

export class OpenTelemetryProvider implements TelemetryProvider {
  name = 'opentelemetry';
  private config: NonNullable<ReportingConfig['telemetry']>['opentelemetry'];
  private logger: Logger;

  constructor(
    config: NonNullable<ReportingConfig['telemetry']>['opentelemetry'],
    logger: Logger,
  ) {
    this.config = config || {};
    this.logger = logger.child({ component: 'OpenTelemetry' });
  }

  isEnabled(): boolean {
    return this.config?.enabled === true && !!this.config.endpoint;
  }

  async send(data: TelemetryData): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const response = await fetch(this.config!.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'mcp-check-telemetry',
        },
        body: JSON.stringify({
          serviceName: this.config!.serviceName || 'mcp-check',
          timestamp: new Date().toISOString(),
          data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.debug('Telemetry data sent to OpenTelemetry', {
        endpoint: this.config!.endpoint,
        testRunId: data.testRun.id,
      });
    } catch (error) {
      this.logger.warn('Failed to send telemetry data to OpenTelemetry', {
        error,
      });
    }
  }
}

export class SentryProvider implements TelemetryProvider {
  name = 'sentry';
  private config: NonNullable<ReportingConfig['telemetry']>['sentry'];
  private logger: Logger;

  constructor(
    config: NonNullable<ReportingConfig['telemetry']>['sentry'],
    logger: Logger,
  ) {
    this.config = config || {};
    this.logger = logger.child({ component: 'Sentry' });
  }

  isEnabled(): boolean {
    return this.config?.enabled === true && !!this.config.dsn;
  }

  async send(data: TelemetryData): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      // Format data for Sentry
      const sentryEvent = {
        event_id: data.testRun.id,
        timestamp: Date.now() / 1000,
        level: data.testRun.success ? 'info' : 'warning',
        logger: 'mcp-check',
        environment: this.config!.environment || 'unknown',
        tags: {
          version: data.environment.mcpCheckVersion,
          platform: data.environment.platform,
          nodeVersion: data.environment.nodeVersion,
          targetType: data.target.type,
          success: data.testRun.success,
        },
        extra: {
          testResults: data.results,
          performance: data.performance,
          duration: data.testRun.duration,
        },
        message: {
          message: `MCP Check completed: ${data.results.passed}/${data.results.total} tests passed`,
          formatted: `MCP Check Test Run - ${data.testRun.success ? 'SUCCESS' : 'FAILURE'}`,
        },
      };

      const response = await fetch(`${this.config!.dsn}/store/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'mcp-check-telemetry',
        },
        body: JSON.stringify(sentryEvent),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.logger.debug('Telemetry data sent to Sentry', {
        dsn: this.config!.dsn,
        testRunId: data.testRun.id,
      });
    } catch (error) {
      this.logger.warn('Failed to send telemetry data to Sentry', { error });
    }
  }
}

export class TelemetryManager {
  private providers: TelemetryProvider[] = [];
  private logger: Logger;
  private redactionConfig: RedactionConfig;

  constructor(config: ReportingConfig, logger: Logger) {
    this.logger = logger.child({ component: 'TelemetryManager' });

    this.redactionConfig = {
      enabled: config.redaction?.enabled ?? true,
      allowedFields: config.redaction?.allowedFields ?? [
        'total',
        'passed',
        'failed',
        'skipped',
        'warnings',
        'duration',
        'success',
        'platform',
        'nodeVersion',
        'mcpCheckVersion',
        'architecture',
        'type',
      ],
      patterns: (config.redaction?.patterns ?? []).map(
        (p) => new RegExp(p, 'gi'),
      ),
      replacement: '[REDACTED]',
    };

    this.initializeProviders(config);
  }

  private initializeProviders(config: ReportingConfig): void {
    if (config.telemetry?.opentelemetry) {
      const provider = new OpenTelemetryProvider(
        config.telemetry.opentelemetry,
        this.logger,
      );
      if (provider.isEnabled()) {
        this.providers.push(provider);
        this.logger.debug('Initialized OpenTelemetry provider');
      }
    }

    if (config.telemetry?.sentry) {
      const provider = new SentryProvider(config.telemetry.sentry, this.logger);
      if (provider.isEnabled()) {
        this.providers.push(provider);
        this.logger.debug('Initialized Sentry provider');
      }
    }
  }

  async sendTelemetry(results: TestResults): Promise<void> {
    if (this.providers.length === 0) {
      this.logger.debug('No telemetry providers enabled');
      return;
    }

    const telemetryData = this.prepareTelemetryData(results);
    const sendPromises = this.providers.map((provider) =>
      provider
        .send(telemetryData)
        .catch((error) =>
          this.logger.warn(`${provider.name} telemetry failed`, { error }),
        ),
    );

    await Promise.allSettled(sendPromises);
    this.logger.debug(
      `Sent telemetry data to ${this.providers.length} providers`,
    );
  }

  private prepareTelemetryData(results: TestResults): TelemetryData {
    const data: TelemetryData = {
      testRun: {
        id: this.generateTestRunId(),
        timestamp: results.metadata.startedAt,
        duration: results.metadata.durationMs,
        success: results.summary.failed === 0,
      },
      environment: {
        mcpCheckVersion: results.metadata.mcpCheckVersion,
        nodeVersion: results.metadata.environment.nodeVersion,
        platform: results.metadata.environment.platform,
        architecture: results.metadata.environment.architecture,
      },
      target: {
        type: 'redacted', // Always redact target details for privacy
      },
      results: results.summary,
      performance: this.extractPerformanceMetrics(results),
    };

    return this.redactTelemetryData(data);
  }

  private extractPerformanceMetrics(results: TestResults) {
    const allTests: Array<{ duration: number }> = [];

    for (const suite of results.suites) {
      for (const testCase of suite.cases) {
        allTests.push({ duration: testCase.durationMs });
      }
    }

    if (allTests.length === 0) {
      return {};
    }

    const durations = allTests.map((t) => t.duration).sort((a, b) => a - b);
    const averageResponseTime =
      durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const throughput = allTests.length / (results.metadata.durationMs / 1000); // tests per second

    return {
      averageResponseTime,
      throughput: Math.round(throughput * 100) / 100, // Round to 2 decimal places
    };
  }

  private redactTelemetryData(data: TelemetryData): TelemetryData {
    if (!this.redactionConfig.enabled) {
      return data;
    }

    return this.redactRecursive(data) as TelemetryData;
  }

  private redactRecursive(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.matchesPattern(obj) ? this.redactionConfig.replacement : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactRecursive(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isAllowedField(key)) {
          result[key] = this.redactRecursive(value);
        } else {
          result[key] = this.redactionConfig.replacement;
        }
      }
      return result;
    }

    return obj;
  }

  private isAllowedField(field: string): boolean {
    return this.redactionConfig.allowedFields.includes(field);
  }

  private matchesPattern(value: string): boolean {
    return this.redactionConfig.patterns.some((pattern) => pattern.test(value));
  }

  private generateTestRunId(): string {
    return `mcp-check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  isEnabled(): boolean {
    return this.providers.length > 0;
  }

  getEnabledProviders(): string[] {
    return this.providers.map((p) => p.name);
  }
}
