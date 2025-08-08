/**
 * Base reporter class with common functionality
 */

import {
  Reporter,
  ReportOutput,
  ReportFormat,
  RedactionConfig,
  DataRedactor,
} from '../types/reporting';
import { TestResults } from '../types/test';
import { ReportingConfig } from '../types/config';

/**
 * Default data redactor implementation
 */
export class DefaultDataRedactor implements DataRedactor {
  private config: RedactionConfig;

  constructor(config: RedactionConfig) {
    this.config = config;
  }

  redact(data: any): any {
    if (!this.config.enabled) {
      return data;
    }

    return this.redactRecursive(data);
  }

  isAllowed(field: string): boolean {
    return this.config.allowedFields.includes(field);
  }

  matchesPattern(value: string): boolean {
    return this.config.patterns.some((pattern) => pattern.test(value));
  }

  private redactRecursive(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.matchesPattern(obj) ? this.config.replacement : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactRecursive(item));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isAllowed(key)) {
          result[key] = this.redactRecursive(value);
        } else {
          result[key] = this.config.replacement;
        }
      }
      return result;
    }

    return obj;
  }
}

/**
 * Base reporter with common functionality
 */
export abstract class BaseReporter implements Reporter {
  protected redactor: DataRedactor;

  constructor(
    public readonly format: ReportFormat,
    protected config: ReportingConfig,
  ) {
    const redactionConfig = {
      enabled: config.redaction?.enabled ?? false,
      allowedFields: config.redaction?.allowedFields ?? [
        'name',
        'status',
        'durationMs',
        'message',
        'type',
        'timestamp',
        'total',
        'passed',
        'failed',
        'skipped',
        'warnings',
      ],
      patterns: (config.redaction?.patterns ?? []).map(
        (p) => new RegExp(p, 'gi'),
      ),
      replacement: '[REDACTED]',
    };

    this.redactor = new DefaultDataRedactor(redactionConfig);
  }

  abstract generate(results: TestResults): Promise<ReportOutput>;

  validate(config: ReportingConfig): boolean {
    // Basic validation - can be overridden by specific reporters
    if (config.formats && !config.formats.includes(this.format)) {
      return false;
    }
    return true;
  }

  protected redactResults(results: TestResults): TestResults {
    return this.redactor.redact(results);
  }

  protected getOutputPath(filename: string): string {
    const outputDir = this.config.outputDir ?? './reports';
    return `${outputDir}/${filename}`;
  }

  protected formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }

  protected formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  protected calculateSuccessRate(summary: TestResults['summary']): number {
    return summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
  }
}
