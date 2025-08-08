/**
 * Test execution types and interfaces
 */

import type { ValidationResult } from './config';
import type { Transport } from './transport';
import type { Logger } from './reporting';
import type { ChaosController, ChaosConfig } from './chaos';

// Re-export for convenience
export type { ValidationResult };

/**
 * Test execution status
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'warning';

/**
 * Test case result
 */
export interface TestCaseResult {
  name: string;
  status: TestStatus;
  durationMs: number;
  details?: Record<string, any>;
  error?: {
    type: string;
    message: string;
    details?: Record<string, any>;
    fixture?: string;
    stack?: string;
  };
  warnings?: string[];
}

/**
 * Test suite result
 */
export interface TestSuiteResult {
  name: string;
  status: TestStatus;
  durationMs: number;
  cases: TestCaseResult[];
  setup?: {
    durationMs: number;
    error?: string;
  };
  teardown?: {
    durationMs: number;
    error?: string;
  };
}

/**
 * Complete test run results
 */
export interface TestResults {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    warnings: number;
  };
  suites: TestSuiteResult[];
  fixtures: TestFixture[];
  metadata: {
    mcpCheckVersion: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    environment: {
      platform: string;
      nodeVersion: string;
      architecture: string;
    };
  };
}

/**
 * Test context passed to test suites
 */
export interface TestContext {
  config: import('./config').ResolvedCheckConfig;
  transport: Transport;
  logger: Logger;
  chaos?: ChaosController;
  fixtures: TestFixtureManager;
}

/**
 * Test fixture for reproducible scenarios
 */
export interface TestFixture {
  id: string;
  description: string;
  timestamp: string;
  chaosConfig?: ChaosConfig;
  target: import('./config').Target;
  scenario: {
    toolName?: string;
    input?: any;
    expectedBehavior: string;
    actualBehavior: string;
  };
  reproduction: {
    command: string;
    environment?: Record<string, string>;
  };
}

/**
 * Test fixture manager interface
 */
export interface TestFixtureManager {
  generate(scenario: Partial<TestFixture>): Promise<TestFixture>;
  save(fixture: TestFixture): Promise<void>;
  load(id: string): Promise<TestFixture>;
  list(): Promise<TestFixture[]>;
}

/**
 * Test suite plugin interface
 */
export interface TestSuitePlugin {
  name: string;
  version: string;
  description: string;
  tags: string[];

  /**
   * Validate configuration for this test suite
   */
  validate(config: Partial<import('./config').CheckConfig>): ValidationResult;

  /**
   * Execute the test suite
   */
  execute(context: TestContext): Promise<TestSuiteResult>;

  /**
   * Optional setup before execution
   */
  setup?(context: TestContext): Promise<void>;

  /**
   * Optional teardown after execution
   */
  teardown?(context: TestContext): Promise<void>;
}

/**
 * Test execution options
 */
export interface TestExecutionOptions {
  suites?: string[];
  failFast?: boolean;
  strict?: boolean;
  parallel?: boolean;
  tags?: string[];
  excludeTags?: string[];
  timeout?: number;
}
