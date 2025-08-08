/**
 * Reporting and logging types
 */

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  child(context: Record<string, any>): Logger;
}

/**
 * Report format types
 */
export type ReportFormat = 'html' | 'json' | 'junit' | 'badge';

/**
 * Reporter interface
 */
export interface Reporter {
  readonly format: ReportFormat;

  /**
   * Generate report from test results
   */
  generate(results: import('./test').TestResults): Promise<ReportOutput>;

  /**
   * Validate reporter configuration
   */
  validate(config: import('./config').ReportingConfig): boolean;
}

/**
 * Report output
 */
export interface ReportOutput {
  format: ReportFormat;
  filename: string;
  content: string | Buffer;
  metadata?: Record<string, any>;
}

/**
 * Badge data for shields.io
 */
export interface BadgeData {
  schemaVersion: number;
  label: string;
  message: string;
  color: string;
  cacheSeconds?: number;
  style?: string;
}

/**
 * HTML report data
 */
export interface HtmlReportData {
  title: string;
  summary: import('./test').TestResults['summary'];
  suites: import('./test').TestSuiteResult[];
  fixtures: import('./test').TestFixture[];
  metadata: import('./test').TestResults['metadata'];
  charts?: {
    performance?: any[];
    timeline?: any[];
  };
}

/**
 * JUnit XML test case
 */
export interface JUnitTestCase {
  name: string;
  classname: string;
  time: number;
  failure?: {
    message: string;
    content: string;
  };
  error?: {
    message: string;
    content: string;
  };
  skipped?: boolean;
}

/**
 * JUnit XML test suite
 */
export interface JUnitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  testcases: JUnitTestCase[];
}

/**
 * Telemetry data
 */
export interface TelemetryData {
  testRun: {
    id: string;
    timestamp: string;
    duration: number;
    success: boolean;
  };
  environment: {
    mcpCheckVersion: string;
    nodeVersion: string;
    platform: string;
    architecture: string;
  };
  target: {
    type: string;
    // Other details redacted for privacy
  };
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  performance: {
    connectionTime?: number;
    averageResponseTime?: number;
    throughput?: number;
  };
}

/**
 * Data redaction configuration
 */
export interface RedactionConfig {
  enabled: boolean;
  allowedFields: string[];
  patterns: RegExp[];
  replacement: string;
}

/**
 * Data redactor interface
 */
export interface DataRedactor {
  redact(data: any): any;
  isAllowed(field: string): boolean;
  matchesPattern(value: string): boolean;
}
