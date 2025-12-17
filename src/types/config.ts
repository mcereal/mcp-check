/**
 * Configuration types for mcp-check
 */

import type { ChaosConfig } from './chaos';

/**
 * Target configuration for different transport types
 */
export type Target =
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      shell?: boolean;
    }
  | {
      type: 'tcp';
      host: string;
      port: number;
      tls?: boolean;
      timeout?: number;
    }
  | {
      type: 'websocket';
      url: string;
      headers?: Record<string, string>;
      protocols?: string[];
    };

/**
 * Tool expectation definition
 */
export interface ToolExpectation {
  name: string;
  required?: boolean;
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  description?: string;
  tags?: string[];
}

/**
 * Resource expectation definition
 */
export interface ResourceExpectation {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * Test expectations configuration
 */
export interface Expectations {
  minProtocolVersion?: string;
  maxProtocolVersion?: string;
  capabilities?: string[];
  tools?: ToolExpectation[];
  resources?: ResourceExpectation[];
  customCapabilities?: Record<string, any>;
}

/**
 * Reporting configuration
 */
export interface ReportingConfig {
  formats?: ('html' | 'json' | 'junit' | 'badge')[];
  outputDir?: string;
  includeFixtures?: boolean;
  redaction?: {
    enabled?: boolean;
    allowedFields?: string[];
    patterns?: string[];
  };
  telemetry?: {
    opentelemetry?: {
      enabled?: boolean;
      endpoint?: string;
      serviceName?: string;
    };
    sentry?: {
      enabled?: boolean;
      dsn?: string;
      environment?: string;
    };
  };
}

/**
 * Parallelism configuration
 */
export interface ParallelismConfig {
  maxConcurrentTests?: number;
  maxConcurrentConnections?: number;
}

/**
 * Timeout configuration
 */
export interface TimeoutConfig {
  connectMs?: number;
  invokeMs?: number;
  shutdownMs?: number;
  streamMs?: number;
}

/**
 * Test parameters configuration - configurable limits for test suites
 */
export interface TestParametersConfig {
  /** Maximum number of unexpected tools to test (default: 3) */
  maxUnexpectedTools?: number;
  /** Maximum number of resources to test in large-payload suite (default: 5) */
  maxResourcesToTest?: number;
  /** Number of rapid requests in streaming tests (default: 10) */
  rapidRequestCount?: number;
  /** Number of concurrent requests in timeout tests (default: 3) */
  concurrentRequestCount?: number;
  /** Number of iterations for progressive/memory tests (default: 10) */
  testIterations?: number;
  /** Payload sizes to test in bytes (default: [1024, 10240, 102400]) */
  payloadSizes?: number[];
  /** Memory growth threshold in MB before warning (default: 10) */
  memoryGrowthThresholdMB?: number;
}

/**
 * Complete configuration interface
 */
export interface CheckConfig {
  $schema?: string;
  target: Target;
  expectations?: Expectations;
  suites?: string[] | 'all';
  timeouts?: TimeoutConfig;
  chaos?: ChaosConfig;
  reporting?: ReportingConfig;
  parallelism?: ParallelismConfig;
  testParameters?: TestParametersConfig;
}

/**
 * Runtime configuration with resolved defaults
 */
export interface ResolvedCheckConfig extends Required<CheckConfig> {
  version: string;
  environment: {
    platform: string;
    nodeVersion: string;
    architecture: string;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
