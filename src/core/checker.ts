/**
 * Main checker orchestration engine
 */

import { EventEmitter } from 'events';
import { ResolvedCheckConfig } from '../types/config';
import {
  TestContext,
  TestSuitePlugin,
  TestResults,
  TestSuiteResult,
  TestExecutionOptions,
} from '../types/test';
import { Transport, TransportFactory } from '../types/transport';
import { Logger } from '../types/reporting';
import { ChaosController } from '../types/chaos';
import { TestFixtureManager } from '../types/test';
import { createLogger } from './logger';
import { FileFixtureManager } from './fixture-manager';
import { MCPTestClient } from './mcp-client';

/**
 * Main checker class that orchestrates test execution
 */
export class MCPChecker extends EventEmitter {
  private suites = new Map<string, TestSuitePlugin>();
  private transportFactory?: TransportFactory;
  private chaosController?: ChaosController;
  private logger: Logger;
  private fixtureManager: TestFixtureManager;

  constructor(
    private config: ResolvedCheckConfig,
    logger?: Logger,
  ) {
    super();
    this.logger = logger || createLogger('info');
    this.fixtureManager = new FileFixtureManager(
      this.config.reporting.outputDir + '/fixtures',
      this.logger,
    );
  }

  /**
   * Register a test suite plugin
   */
  registerSuite(suite: TestSuitePlugin): void {
    this.suites.set(suite.name, suite);
    this.logger.debug(`Registered test suite: ${suite.name}`);
  }

  /**
   * Register multiple test suite plugins
   */
  registerSuites(suites: TestSuitePlugin[]): void {
    for (const suite of suites) {
      this.registerSuite(suite);
    }
  }

  /**
   * Set the transport factory
   */
  setTransportFactory(factory: TransportFactory): void {
    this.transportFactory = factory;
  }

  /**
   * Set the chaos controller
   */
  setChaosController(controller: ChaosController): void {
    this.chaosController = controller;
  }

  /**
   * Execute all configured test suites
   */
  async run(options?: TestExecutionOptions): Promise<TestResults> {
    const startTime = Date.now();
    this.logger.info('Starting MCP conformance tests', {
      target: this.config.target,
      suites: options?.suites || this.config.suites,
    });

    this.emit('start', { config: this.config });

    try {
      const results = await this.executeTests(options);
      const endTime = Date.now();

      // Populate fixtures from fixture manager (may have been written by suites)
      results.fixtures = await this.fixtureManager.list();

      results.metadata = {
        mcpCheckVersion: this.config.version,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        durationMs: endTime - startTime,
        environment: this.config.environment,
      };

      this.emit('complete', results);

      const { summary } = results;
      this.logger.info('Test execution completed', {
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        warnings: summary.warnings,
        duration: endTime - startTime,
      });

      return results;
    } catch (error) {
      this.emit('error', error);
      this.logger.error('Test execution failed', { error: error.message });
      throw error;
    }
  }

  private async executeTests(
    options?: TestExecutionOptions,
  ): Promise<TestResults> {
    const suitesToRun = this.getSuitesToRun(options);
    const maxConcurrent = this.config.parallelism?.maxConcurrentTests || suitesToRun.length;
    const isParallel = options?.parallel && maxConcurrent > 1 && suitesToRun.length > 1;

    if (isParallel) {
      this.logger.info(`Parallel execution: ${suitesToRun.length} suites, max ${maxConcurrent} concurrent`);
      return this.executeTestsParallel(suitesToRun, options, maxConcurrent);
    }
    return this.executeTestsSequential(suitesToRun, options);
  }

  private async executeTestsSequential(
    suitesToRun: string[],
    options?: TestExecutionOptions,
  ): Promise<TestResults> {
    const transport = await this.createTransport();

    try {
      const context = await this.createTestContext(transport);
      const suiteResults: TestSuiteResult[] = [];

      for (const suiteName of suitesToRun) {
        const suite = this.suites.get(suiteName);
        if (!suite) {
          this.logger.warn(`Test suite not found: ${suiteName}`);
          continue;
        }

        this.logger.info(`Running test suite: ${suiteName}`);
        this.emit('suite-start', { name: suiteName });

        try {
          const result = await this.runSuite(suite, context);
          suiteResults.push(result);
          this.emit('suite-complete', result);

          if (options?.failFast && result.status === 'failed') {
            this.logger.info('Stopping execution due to fail-fast mode');
            break;
          }
        } catch (error) {
          this.logger.error(`Error running test suite ${suiteName}`, {
            error: error.message,
          });
          suiteResults.push(this.createErrorResult(suiteName, error));
        }
      }

      return this.aggregateResults(suiteResults);
    } finally {
      await this.cleanupTransport(transport);
    }
  }

  private async executeTestsParallel(
    suitesToRun: string[],
    options: TestExecutionOptions | undefined,
    maxConcurrent: number,
  ): Promise<TestResults> {
    const abortController = new AbortController();
    const suiteResults: TestSuiteResult[] = [];

    const runOne = async (suiteName: string): Promise<void> => {
      if (abortController.signal.aborted) return;

      const suite = this.suites.get(suiteName);
      if (!suite) {
        this.logger.warn(`Test suite not found: ${suiteName}`);
        return;
      }

      this.logger.info(`Running test suite: ${suiteName}`);
      this.emit('suite-start', { name: suiteName });

      // Each parallel suite gets its own isolated transport + context
      const transport = await this.createTransport();
      try {
        const context = await this.createTestContext(transport);
        const result = await this.runSuite(suite, context);
        suiteResults.push(result);
        this.emit('suite-complete', result);

        if (options?.failFast && result.status === 'failed') {
          this.logger.info(`Fail-fast: aborting remaining suites after ${suiteName}`);
          abortController.abort();
        }
      } catch (error) {
        this.logger.error(`Error running test suite ${suiteName}`, {
          error: error.message,
        });
        suiteResults.push(this.createErrorResult(suiteName, error));
      } finally {
        await this.cleanupTransport(transport);
      }
    };

    await this.runWithConcurrency(suitesToRun, runOne, maxConcurrent);

    return this.aggregateResults(suiteResults);
  }

  /**
   * Run async tasks with a concurrency limit (semaphore pattern).
   */
  private async runWithConcurrency<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    maxConcurrent: number,
  ): Promise<void> {
    const queue = [...items];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      while (running.length < maxConcurrent && queue.length > 0) {
        const item = queue.shift()!;
        const promise = fn(item).then(
          () => { running.splice(running.indexOf(promise), 1); },
          () => { running.splice(running.indexOf(promise), 1); },
        );
        running.push(promise);
      }
      if (running.length > 0) {
        await Promise.race(running);
      }
    }
  }

  /**
   * Aggregate suite results into a TestResults summary.
   */
  private aggregateResults(suiteResults: TestSuiteResult[]): TestResults {
    let totalTests = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let warnings = 0;

    for (const result of suiteResults) {
      for (const testCase of result.cases || []) {
        totalTests++;
        switch (testCase.status) {
          case 'passed': passed++; break;
          case 'failed': failed++; break;
          case 'skipped': skipped++; break;
          case 'warning': warnings++; break;
        }
      }
    }

    return {
      summary: { total: totalTests, passed, failed, skipped, warnings },
      suites: suiteResults,
      fixtures: [],  // populated asynchronously below
      metadata: {
        mcpCheckVersion: '',
        startedAt: '',
        completedAt: '',
        durationMs: 0,
        environment: this.config.environment,
      },
    };
  }

  private createErrorResult(suiteName: string, error: any): TestSuiteResult {
    return {
      name: suiteName,
      status: 'failed',
      durationMs: 0,
      cases: [],
      setup: { durationMs: 0, error: error.message },
    };
  }

  private async runSuite(
    suite: TestSuitePlugin,
    context: TestContext,
  ): Promise<TestSuiteResult> {
    const startTime = Date.now();

    try {
      // Validate configuration for this suite
      const validation = suite.validate(this.config);
      if (!validation.valid) {
        throw new Error(
          `Configuration validation failed: ${validation.errors?.join(', ')}`,
        );
      }

      // Run setup if provided
      let setupResult;
      if (suite.setup) {
        const setupStart = Date.now();
        try {
          await suite.setup(context);
          setupResult = {
            durationMs: Date.now() - setupStart,
          };
        } catch (error) {
          setupResult = {
            durationMs: Date.now() - setupStart,
            error: error.message,
          };
          throw error;
        }
      }

      // Execute the test suite
      const result = await suite.execute(context);

      // Run teardown if provided
      let teardownResult;
      if (suite.teardown) {
        const teardownStart = Date.now();
        try {
          await suite.teardown(context);
          teardownResult = {
            durationMs: Date.now() - teardownStart,
          };
        } catch (error) {
          teardownResult = {
            durationMs: Date.now() - teardownStart,
            error: error.message,
          };
          // Don't throw teardown errors, just log them
          this.logger.warn(`Teardown error in ${suite.name}`, {
            error: error.message,
          });
        }
      }

      return {
        ...result,
        durationMs: Date.now() - startTime,
        setup: setupResult,
        teardown: teardownResult,
      };
    } catch (error) {
      return {
        name: suite.name,
        status: 'failed',
        durationMs: Date.now() - startTime,
        cases: [],
        setup: {
          durationMs: 0,
          error: error.message,
        },
      };
    }
  }

  private getSuitesToRun(options?: TestExecutionOptions): string[] {
    // Handle options.suites first (CLI override)
    if (options?.suites && options.suites.length > 0) {
      const requestedSuites = options.suites.filter((name) =>
        this.suites.has(name),
      );
      if (requestedSuites.length === 0) {
        throw new Error('No valid test suites found to run');
      }
      return this.applyTagFilters(requestedSuites, options);
    }

    // Handle 'all' - run all registered suites
    if (this.config.suites === 'all') {
      const allSuites = Array.from(this.suites.keys());
      if (allSuites.length === 0) {
        throw new Error('No test suites registered');
      }
      return this.applyTagFilters(allSuites, options);
    }

    // Handle array of suite names
    const configuredSuites = Array.isArray(this.config.suites)
      ? this.config.suites
      : [];

    // Filter out suites that aren't registered
    const availableSuites = configuredSuites.filter((name) =>
      this.suites.has(name),
    );

    if (availableSuites.length === 0) {
      throw new Error('No valid test suites found to run');
    }

    return this.applyTagFilters(availableSuites, options);
  }

  private applyTagFilters(
    suites: string[],
    options?: TestExecutionOptions,
  ): string[] {
    // Apply tag filtering if specified
    if (options?.tags || options?.excludeTags) {
      return suites.filter((name) => {
        const suite = this.suites.get(name)!;

        if (options.tags) {
          const hasRequiredTag = options.tags.some((tag) =>
            suite.tags.includes(tag),
          );
          if (!hasRequiredTag) return false;
        }

        if (options.excludeTags) {
          const hasExcludedTag = options.excludeTags.some((tag) =>
            suite.tags.includes(tag),
          );
          if (hasExcludedTag) return false;
        }

        return true;
      });
    }

    return suites;
  }

  private async createTransport(): Promise<Transport> {
    if (!this.transportFactory) {
      throw new Error(
        'Transport factory not set. Call setTransportFactory() first.',
      );
    }

    const transport = this.transportFactory.create(this.config.target);
    await transport.connect(this.config.target);

    this.logger.info('Connected to target', {
      type: transport.type,
      state: transport.state,
    });

    return transport;
  }

  private async createTestContext(transport: Transport): Promise<TestContext> {
    return {
      config: this.config,
      transport,
      logger: this.logger.child({ component: 'test-context' }),
      chaos: this.chaosController,
      fixtures: this.fixtureManager,
    };
  }

  private async cleanupTransport(transport: Transport): Promise<void> {
    try {
      await transport.close();
      this.logger.debug('Transport closed successfully');
    } catch (error) {
      this.logger.warn('Error closing transport', { error: error.message });
    }
  }
}
