/**
 * CLI main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  resolveConfig,
  createDefaultConfig,
  validateConfig,
} from '../core/config';
import { MCPChecker } from '../core/checker';
import { DefaultTransportFactory } from '../transports/factory';
import { HandshakeTestSuite } from '../suites/handshake';
import { ToolDiscoveryTestSuite } from '../suites/tool-discovery';
import { ToolInvocationTestSuite } from '../suites/tool-invocation';
import { StreamingTestSuite } from '../suites/streaming';
import { createLogger } from '../core/logger';

// Load package.json to get version
const packageJson = require('../../package.json');

/**
 * Main CLI function
 */
export async function runCLI(): Promise<void> {
  const program = new Command();

  program
    .name('mcp-check')
    .description(
      'Comprehensive testing framework for Model Context Protocol (MCP) servers and clients',
    )
    .version(packageJson.version);

  // Main test command
  program
    .command('test')
    .description('Run MCP conformance tests')
    .option('-c, --config <path>', 'Configuration file path')
    .option(
      '-s, --suites <suites>',
      'Comma-separated list of test suites to run',
    )
    .option(
      '-f, --format <formats>',
      'Output formats (json,html,junit,badge)',
      'json,html',
    )
    .option(
      '-o, --output-dir <dir>',
      'Output directory for reports',
      './reports',
    )
    .option('--strict', 'Enable strict mode (fail on unexpected capabilities)')
    .option('--fail-fast', 'Stop on first test failure')
    .option('--chaos-seed <seed>', 'Seed for reproducible chaos testing')
    .option(
      '--chaos-intensity <level>',
      'Chaos intensity: low, medium, high, extreme',
    )
    .option('--chaos-network', 'Enable network chaos (delays, packet loss)')
    .option('--chaos-protocol', 'Enable protocol chaos (malformed messages)')
    .option('--chaos-timing', 'Enable timing chaos (clock skew, delays)')
    .option('--no-chaos', 'Disable all chaos engineering')
    .option('--timeout.connect <ms>', 'Connection timeout in milliseconds')
    .option('--timeout.invoke <ms>', 'Invocation timeout in milliseconds')
    .option('--verbose', 'Enable verbose logging')
    .option('--debug <patterns>', 'Debug patterns (e.g., mcp:*)')
    .action(async (options) => {
      try {
        await runTests(options);
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    });

  // Init command
  program
    .command('init')
    .description('Create a default configuration file')
    .option(
      '-o, --output <path>',
      'Output path for config file',
      'mcp-check.config.json',
    )
    .action(async (options) => {
      try {
        await createDefaultConfig(options.output);
        console.log(
          chalk.green(`Created configuration file: ${options.output}`),
        );
      } catch (error) {
        console.error(chalk.red('Error creating config:'), error.message);
        process.exit(1);
      }
    });

  // Validate command
  program
    .command('validate')
    .description('Validate configuration file')
    .option('-c, --config <path>', 'Configuration file path')
    .action(async (options) => {
      try {
        const config = await loadConfig(options.config);
        const validation = validateConfig(config);

        if (validation.valid) {
          console.log(chalk.green('✓ Configuration is valid'));
        } else {
          console.log(chalk.red('✗ Configuration is invalid:'));
          for (const error of validation.errors || []) {
            console.log(chalk.red(`  - ${error}`));
          }
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error validating config:'), error.message);
        process.exit(1);
      }
    });

  // List suites command
  program
    .command('list-suites')
    .description('List available test suites')
    .action(() => {
      const suites = [
        {
          name: 'handshake',
          description: 'MCP protocol handshake and capability negotiation',
        },
        {
          name: 'tool-discovery',
          description: 'Tool enumeration and schema validation',
        },
        {
          name: 'tool-invocation',
          description: 'Tool execution under various conditions',
        },
        {
          name: 'streaming',
          description: 'Streaming response handling and ordering',
        },
      ];

      console.log(chalk.blue('Available test suites:'));
      for (const suite of suites) {
        console.log(`  ${chalk.green(suite.name)}: ${suite.description}`);
      }
    });

  await program.parseAsync();
}

async function runTests(options: any): Promise<void> {
  // Set up logging
  const logLevel = options.verbose ? 'debug' : 'info';
  const logger = createLogger(logLevel, true);

  if (options.debug) {
    process.env.DEBUG = options.debug;
  }

  // Load and validate configuration
  const config = await loadConfig(options.config);
  const validation = validateConfig(config);

  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors?.join(', ')}`);
  }

  // Override config with CLI options
  const overrides: any = {};

  if (options.suites) {
    overrides.suites = options.suites.split(',').map((s: string) => s.trim());
  }

  if (options.format || options.outputDir) {
    overrides.reporting = {
      ...config.reporting,
      formats: options.format
        ? options.format.split(',').map((f: string) => f.trim())
        : config.reporting?.formats,
      outputDir: options.outputDir || config.reporting?.outputDir,
    };
  }

  if (
    options.chaosSeed ||
    options.chaosIntensity ||
    options.chaosNetwork ||
    options.chaosProtocol ||
    options.chaosTiming ||
    options.noChaos
  ) {
    const chaosConfig = { ...config.chaos };

    if (options.noChaos) {
      chaosConfig.enable = false;
    } else {
      chaosConfig.enable = true;

      if (options.chaosSeed) {
        chaosConfig.seed = parseInt(options.chaosSeed, 10);
      }

      if (options.chaosIntensity) {
        const intensityMap = {
          low: 0.05,
          medium: 0.1,
          high: 0.3,
          extreme: 0.5,
        };
        chaosConfig.intensity = intensityMap[options.chaosIntensity] || 0.1;
      }

      if (options.chaosNetwork) {
        chaosConfig.network = {
          ...chaosConfig.network,
          delayMs: [0, 100],
          dropProbability: 0.01,
          duplicateProbability: 0.005,
        };
      }

      if (options.chaosProtocol) {
        chaosConfig.protocol = {
          ...chaosConfig.protocol,
          malformedJsonProbability: 0.01,
          unexpectedMessageProbability: 0.02,
        };
      }

      if (options.chaosTiming) {
        chaosConfig.timing = {
          ...chaosConfig.timing,
          clockSkewMs: [-1000, 1000],
          processingDelayMs: [0, 50],
        };
      }
    }

    overrides.chaos = chaosConfig;
  }

  if (options['timeout.connect'] || options['timeout.invoke']) {
    overrides.timeouts = {
      ...config.timeouts,
      connectMs: options['timeout.connect']
        ? parseInt(options['timeout.connect'], 10)
        : config.timeouts?.connectMs,
      invokeMs: options['timeout.invoke']
        ? parseInt(options['timeout.invoke'], 10)
        : config.timeouts?.invokeMs,
    };
  }

  const finalConfig = resolveConfig({ ...config, ...overrides });

  // Create checker
  const checker = new MCPChecker(finalConfig, logger);

  // Set up transport factory
  checker.setTransportFactory(new DefaultTransportFactory());

  // Set up chaos controller if enabled
  if (finalConfig.chaos?.enable) {
    const { ChaosFactory } = await import('../chaos/factory');

    let chaosController;
    if (options.chaosIntensity) {
      chaosController = ChaosFactory.createByIntensity(
        options.chaosIntensity,
        finalConfig.chaos.seed,
      );
    } else {
      chaosController = ChaosFactory.createDefault(finalConfig.chaos);
    }

    checker.setChaosController(chaosController);
    logger.info('Chaos engineering enabled', {
      seed: finalConfig.chaos.seed,
      intensity: finalConfig.chaos.intensity,
    });
  }

  // Register test suites
  checker.registerSuites([
    new HandshakeTestSuite(),
    new ToolDiscoveryTestSuite(),
    new ToolInvocationTestSuite(),
    new StreamingTestSuite(),
  ]);

  // Set up event listeners
  checker.on('start', (data) => {
    logger.info(`Starting tests with target: ${data.config.target.type}`);
  });

  checker.on('suite-start', (data) => {
    logger.info(`Running suite: ${data.name}`);
  });

  checker.on('suite-complete', (result) => {
    const status =
      result.status === 'passed'
        ? chalk.green('PASSED')
        : result.status === 'failed'
          ? chalk.red('FAILED')
          : chalk.yellow('WARNING');

    logger.info(`Suite ${result.name}: ${status} (${result.durationMs}ms)`);
  });

  // Run tests
  const testOptions = {
    failFast: options.failFast,
    strict: options.strict,
  };

  logger.info('Starting MCP conformance tests...');
  const results = await checker.run(testOptions);

  // Display summary
  const { summary } = results;
  console.log('\n' + chalk.blue('Test Results Summary:'));
  console.log(`  Total: ${summary.total}`);
  console.log(`  ${chalk.green('Passed')}: ${summary.passed}`);
  console.log(`  ${chalk.red('Failed')}: ${summary.failed}`);
  console.log(`  ${chalk.yellow('Skipped')}: ${summary.skipped}`);
  console.log(`  ${chalk.yellow('Warnings')}: ${summary.warnings}`);

  // Generate reports
  await generateReports(results, finalConfig, logger);

  // Exit with appropriate code
  process.exit(summary.failed > 0 ? 1 : 0);
}

async function generateReports(
  results: any,
  config: any,
  logger: any,
): Promise<void> {
  try {
    const { ReportManager } = await import('../reporting/report-manager');
    const { TelemetryManager } = await import('../reporting/telemetry');

    // Initialize and validate report manager
    const reportManager = new ReportManager(config.reporting, logger);
    const validation = await reportManager.validateConfiguration();

    if (!validation.valid) {
      logger.warn('Report configuration issues:', validation.errors);
    }

    logger.info(`Generating reports in ${config.reporting.outputDir}`);

    // Generate all configured reports
    const reports = await reportManager.generateReports(results);

    // Generate test fixtures if configured
    if (config.reporting.includeFixtures) {
      await reportManager.generateFixtures(results);
    }

    // Send telemetry if configured
    if (config.reporting.telemetry) {
      const telemetryManager = new TelemetryManager(config.reporting, logger);
      if (telemetryManager.isEnabled()) {
        await telemetryManager.sendTelemetry(results);
        logger.debug(
          'Telemetry sent to providers:',
          telemetryManager.getEnabledProviders(),
        );
      }
    }

    // Log report generation results
    for (const report of reports) {
      const filePath = `${config.reporting.outputDir}/${report.filename}`;
      logger.info(`Generated ${report.format} report: ${filePath}`);
    }

    console.log('\n' + chalk.blue('Reports Generated:'));
    for (const report of reports) {
      const filePath = `${config.reporting.outputDir}/${report.filename}`;
      console.log(
        `  ${chalk.green('✓')} ${report.format.toUpperCase()}: ${filePath}`,
      );
    }
  } catch (error) {
    logger.error('Failed to generate reports:', error);
    throw error;
  }
}
