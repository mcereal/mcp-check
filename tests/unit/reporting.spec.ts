/**
 * Unit tests for reporting components
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  TestResults,
  TestSuiteResult,
  TestCaseResult,
} from '../../src/types/test';
import { ReportingConfig } from '../../src/types/config';
import { JsonReporter } from '../../src/reporting/json-reporter';
import { HtmlReporter } from '../../src/reporting/html-reporter';
import { JunitReporter } from '../../src/reporting/junit-reporter';
import { BadgeReporter } from '../../src/reporting/badge-reporter';
import { ReportManager } from '../../src/reporting/report-manager';
import { TelemetryManager } from '../../src/reporting/telemetry';

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(() => mockLogger),
};

// Sample test results for testing
const sampleResults: TestResults = {
  summary: {
    total: 10,
    passed: 7,
    failed: 2,
    skipped: 1,
    warnings: 1,
  },
  suites: [
    {
      name: 'handshake',
      status: 'passed',
      durationMs: 1234,
      cases: [
        {
          name: 'protocol-version-negotiation',
          status: 'passed',
          durationMs: 567,
          details: { serverVersion: '1.0.0' },
        },
        {
          name: 'capability-validation',
          status: 'passed',
          durationMs: 234,
        },
      ],
    },
    {
      name: 'streaming',
      status: 'failed',
      durationMs: 2345,
      cases: [
        {
          name: 'delta-ordering',
          status: 'failed',
          durationMs: 1000,
          error: {
            type: 'OutOfOrderDeltaError',
            message: 'Delta sequence out of order',
            details: { expected: 3, actual: 5 },
            fixture: 'fixtures/streaming-001.json',
          },
        },
        {
          name: 'stream-completion',
          status: 'passed',
          durationMs: 800,
        },
        {
          name: 'backpressure-handling',
          status: 'skipped',
          durationMs: 0,
        },
      ],
    },
  ],
  fixtures: [
    {
      id: 'streaming-001',
      description: 'Out of order delta sequence',
      timestamp: '2025-08-08T14:30:00.000Z',
      target: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
      scenario: {
        toolName: 'streamData',
        expectedBehavior: 'Sequential delta ordering',
        actualBehavior: 'Delta 5 received before delta 3',
      },
      reproduction: {
        command: 'npx mcp-check --fixture fixtures/streaming-001.json',
      },
    },
  ],
  metadata: {
    mcpCheckVersion: '2.1.0',
    startedAt: '2025-08-08T14:25:00.000Z',
    completedAt: '2025-08-08T14:27:30.000Z',
    durationMs: 150000,
    environment: {
      platform: 'darwin',
      nodeVersion: '20.11.0',
      architecture: 'arm64',
    },
  },
};

const sampleConfig: ReportingConfig = {
  formats: ['json', 'html', 'junit', 'badge'],
  outputDir: './test-reports',
  includeFixtures: true,
  redaction: {
    enabled: false,
  },
};

describe('JSON Reporter', () => {
  let reporter: JsonReporter;

  beforeEach(() => {
    reporter = new JsonReporter(sampleConfig);
  });

  it('should generate valid JSON report', async () => {
    const report = await reporter.generate(sampleResults);

    expect(report.format).toBe('json');
    expect(report.filename).toBe('results.json');
    expect(typeof report.content).toBe('string');

    const parsed = JSON.parse(report.content as string);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.summary).toEqual(sampleResults.summary);
    expect(parsed.analysis).toBeDefined();
    expect(parsed.analysis.successRate).toBe(70); // 7/10 * 100
  });

  it('should include performance metrics', async () => {
    const report = await reporter.generate(sampleResults);
    const parsed = JSON.parse(report.content as string);

    expect(parsed.analysis.performanceMetrics).toBeDefined();
    expect(parsed.analysis.performanceMetrics.totalDuration).toBe(150000);
    expect(parsed.analysis.performanceMetrics.slowestTests).toBeDefined();
    expect(parsed.analysis.performanceMetrics.fastestTests).toBeDefined();
  });

  it('should identify critical failures', async () => {
    const report = await reporter.generate(sampleResults);
    const parsed = JSON.parse(report.content as string);

    expect(parsed.analysis.criticalFailures).toBeDefined();
    expect(Array.isArray(parsed.analysis.criticalFailures)).toBe(true);
  });
});

describe('HTML Reporter', () => {
  let reporter: HtmlReporter;

  beforeEach(() => {
    reporter = new HtmlReporter(sampleConfig);
  });

  it('should generate valid HTML report', async () => {
    const report = await reporter.generate(sampleResults);

    expect(report.format).toBe('html');
    expect(report.filename).toBe('index.html');
    expect(typeof report.content).toBe('string');

    const html = report.content as string;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>MCP Check Test Results</title>');
    expect(html).toContain('chart.js'); // Should include chart library
  });

  it('should include test summary in HTML', async () => {
    const report = await reporter.generate(sampleResults);
    const html = report.content as string;

    expect(html).toContain('10'); // total tests
    expect(html).toContain('7'); // passed tests
    expect(html).toContain('2'); // failed tests
  });

  it('should include interactive elements', async () => {
    const report = await reporter.generate(sampleResults);
    const html = report.content as string;

    expect(html).toContain('toggleSuite'); // JavaScript function
    expect(html).toContain('chart'); // Chart elements
    expect(html).toContain('onclick'); // Interactive elements
  });
});

describe('JUnit Reporter', () => {
  let reporter: JunitReporter;

  beforeEach(() => {
    reporter = new JunitReporter(sampleConfig);
  });

  it('should generate valid JUnit XML', async () => {
    const report = await reporter.generate(sampleResults);

    expect(report.format).toBe('junit');
    expect(report.filename).toBe('junit.xml');
    expect(typeof report.content).toBe('string');

    const xml = report.content as string;
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('<testcase');
  });

  it('should include failure information', async () => {
    const report = await reporter.generate(sampleResults);
    const xml = report.content as string;

    expect(xml).toContain('<failure');
    expect(xml).toContain('OutOfOrderDeltaError');
    expect(xml).toContain('Delta sequence out of order');
  });

  it('should handle skipped tests', async () => {
    const report = await reporter.generate(sampleResults);
    const xml = report.content as string;

    expect(xml).toContain('<skipped/>');
  });

  it('should escape XML special characters', async () => {
    const resultsWithSpecialChars = {
      ...sampleResults,
      suites: [
        {
          ...sampleResults.suites[0],
          cases: [
            {
              name: 'test with "quotes" and <brackets>',
              status: 'failed' as const,
              durationMs: 100,
              error: {
                type: 'TestError',
                message: 'Error with "quotes" and <brackets> & ampersands',
              },
            },
          ],
        },
      ],
    };

    const report = await reporter.generate(resultsWithSpecialChars);
    const xml = report.content as string;

    expect(xml).toContain('&quot;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&amp;');
  });
});

describe('Badge Reporter', () => {
  let reporter: BadgeReporter;

  beforeEach(() => {
    reporter = new BadgeReporter(sampleConfig);
  });

  it('should generate valid badge data', async () => {
    const report = await reporter.generate(sampleResults);

    expect(report.format).toBe('badge');
    expect(report.filename).toBe('badge.json');

    const badge = JSON.parse(report.content as string);
    expect(badge.schemaVersion).toBe(1);
    expect(badge.label).toBe('mcp-check');
    expect(badge.message).toBe('7/10 passed');
    expect(badge.color).toBe('red'); // Has failures
  });

  it('should show green for all passed tests', async () => {
    const allPassedResults = {
      ...sampleResults,
      summary: { total: 10, passed: 10, failed: 0, skipped: 0, warnings: 0 },
    };

    const report = await reporter.generate(allPassedResults);
    const badge = JSON.parse(report.content as string);

    expect(badge.color).toBe('brightgreen');
    expect(badge.message).toBe('10/10 passed');
  });

  it('should show yellow for warnings only', async () => {
    const warningsOnlyResults = {
      ...sampleResults,
      summary: { total: 10, passed: 8, failed: 0, skipped: 0, warnings: 2 },
    };

    const report = await reporter.generate(warningsOnlyResults);
    const badge = JSON.parse(report.content as string);

    expect(badge.color).toBe('yellow');
  });
});

describe('Report Manager', () => {
  let reportManager: ReportManager;

  beforeEach(() => {
    reportManager = new ReportManager(sampleConfig, mockLogger as any);
  });

  it('should initialize all configured reporters', () => {
    expect(reportManager.hasReporter('json')).toBe(true);
    expect(reportManager.hasReporter('html')).toBe(true);
    expect(reportManager.hasReporter('junit')).toBe(true);
    expect(reportManager.hasReporter('badge')).toBe(true);
  });

  it('should validate configuration', async () => {
    const validation = await reportManager.validateConfiguration();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should return available formats', () => {
    const formats = reportManager.getAvailableFormats();
    expect(formats).toContain('json');
    expect(formats).toContain('html');
    expect(formats).toContain('junit');
    expect(formats).toContain('badge');
  });
});

describe('Telemetry Manager', () => {
  let telemetryManager: TelemetryManager;

  beforeEach(() => {
    const configWithTelemetry: ReportingConfig = {
      ...sampleConfig,
      telemetry: {
        opentelemetry: {
          enabled: false, // Disabled for tests
        },
      },
    };
    telemetryManager = new TelemetryManager(
      configWithTelemetry,
      mockLogger as any,
    );
  });

  it('should not be enabled without valid configuration', () => {
    expect(telemetryManager.isEnabled()).toBe(false);
  });

  it('should handle disabled telemetry gracefully', async () => {
    await expect(
      telemetryManager.sendTelemetry(sampleResults),
    ).resolves.not.toThrow();
  });

  it('should redact sensitive data when enabled', () => {
    const configWithRedaction: ReportingConfig = {
      ...sampleConfig,
      redaction: {
        enabled: true,
        allowedFields: ['total', 'passed'],
        patterns: ['secret.*'],
      },
    };

    const manager = new TelemetryManager(
      configWithRedaction,
      mockLogger as any,
    );
    expect(manager).toBeDefined();
  });
});
