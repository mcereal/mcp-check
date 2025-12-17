import {
  TelemetryManager,
  OpenTelemetryProvider,
  SentryProvider,
} from '../../../src/reporting/telemetry';
import { ReportingConfig } from '../../../src/types/config';
import { TestResults } from '../../../src/types/test';
import { Logger } from '../../../src/types/reporting';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Telemetry', () => {
  const mockLogger: Logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };

  const createMockTestResults = (overrides?: Partial<TestResults>): TestResults => ({
    summary: {
      total: 10,
      passed: 8,
      failed: 1,
      skipped: 1,
      warnings: 0,
    },
    suites: [
      {
        name: 'test-suite',
        status: 'passed',
        cases: [
          { name: 'test-1', status: 'passed', durationMs: 100 },
          { name: 'test-2', status: 'passed', durationMs: 200 },
          { name: 'test-3', status: 'failed', durationMs: 150, error: { type: 'Error', message: 'Failed' } },
        ],
        durationMs: 450,
      },
    ],
    fixtures: [],
    metadata: {
      mcpCheckVersion: '1.0.0',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 500,
      environment: {
        platform: 'darwin',
        nodeVersion: 'v20.0.0',
        architecture: 'x64',
      },
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('OpenTelemetryProvider', () => {
    it('is disabled when config is missing', () => {
      const provider = new OpenTelemetryProvider(undefined, mockLogger);
      expect(provider.isEnabled()).toBe(false);
    });

    it('is disabled when enabled is false', () => {
      const provider = new OpenTelemetryProvider(
        { enabled: false, endpoint: 'http://localhost:4318' },
        mockLogger,
      );
      expect(provider.isEnabled()).toBe(false);
    });

    it('is disabled when endpoint is missing', () => {
      const provider = new OpenTelemetryProvider(
        { enabled: true },
        mockLogger,
      );
      expect(provider.isEnabled()).toBe(false);
    });

    it('is enabled when config is complete', () => {
      const provider = new OpenTelemetryProvider(
        { enabled: true, endpoint: 'http://localhost:4318' },
        mockLogger,
      );
      expect(provider.isEnabled()).toBe(true);
    });

    it('sends telemetry data via HTTP POST', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const provider = new OpenTelemetryProvider(
        { enabled: true, endpoint: 'http://localhost:4318', serviceName: 'test-service' },
        mockLogger,
      );

      const telemetryData = {
        testRun: { id: 'test-123', timestamp: '2024-01-01T00:00:00Z', duration: 100, success: true },
        environment: { mcpCheckVersion: '1.0.0', nodeVersion: 'v20', platform: 'darwin', architecture: 'x64' },
        target: { type: 'stdio' },
        results: { total: 1, passed: 1, failed: 0, skipped: 0, warnings: 0 },
        performance: {},
      };

      await provider.send(telemetryData);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4318', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'mcp-check-telemetry',
        },
        body: expect.stringContaining('"serviceName":"test-service"'),
      });
    });

    it('does not send when disabled', async () => {
      const provider = new OpenTelemetryProvider(
        { enabled: false, endpoint: 'http://localhost:4318' },
        mockLogger,
      );

      await provider.send({} as any);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });

      const provider = new OpenTelemetryProvider(
        { enabled: true, endpoint: 'http://localhost:4318' },
        mockLogger,
      );

      await provider.send({
        testRun: { id: 'test', timestamp: '', duration: 0, success: true },
        environment: { mcpCheckVersion: '', nodeVersion: '', platform: '', architecture: '' },
        target: { type: '' },
        results: { total: 0, passed: 0, failed: 0, skipped: 0 },
        performance: {},
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to send telemetry data to OpenTelemetry',
        expect.any(Object),
      );
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = new OpenTelemetryProvider(
        { enabled: true, endpoint: 'http://localhost:4318' },
        mockLogger,
      );

      await provider.send({
        testRun: { id: 'test', timestamp: '', duration: 0, success: true },
        environment: { mcpCheckVersion: '', nodeVersion: '', platform: '', architecture: '' },
        target: { type: '' },
        results: { total: 0, passed: 0, failed: 0, skipped: 0 },
        performance: {},
      });

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('SentryProvider', () => {
    it('is disabled when config is missing', () => {
      const provider = new SentryProvider(undefined, mockLogger);
      expect(provider.isEnabled()).toBe(false);
    });

    it('is disabled when enabled is false', () => {
      const provider = new SentryProvider(
        { enabled: false, dsn: 'https://key@sentry.io/123' },
        mockLogger,
      );
      expect(provider.isEnabled()).toBe(false);
    });

    it('is disabled when dsn is missing', () => {
      const provider = new SentryProvider(
        { enabled: true },
        mockLogger,
      );
      expect(provider.isEnabled()).toBe(false);
    });

    it('is enabled when config is complete', () => {
      const provider = new SentryProvider(
        { enabled: true, dsn: 'https://key@sentry.io/123' },
        mockLogger,
      );
      expect(provider.isEnabled()).toBe(true);
    });

    it('sends telemetry data to Sentry', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const provider = new SentryProvider(
        { enabled: true, dsn: 'https://key@sentry.io/123', environment: 'test' },
        mockLogger,
      );

      const telemetryData = {
        testRun: { id: 'test-123', timestamp: '2024-01-01T00:00:00Z', duration: 100, success: true },
        environment: { mcpCheckVersion: '1.0.0', nodeVersion: 'v20', platform: 'darwin', architecture: 'x64' },
        target: { type: 'stdio' },
        results: { total: 5, passed: 5, failed: 0, skipped: 0, warnings: 0 },
        performance: {},
      };

      await provider.send(telemetryData);

      expect(mockFetch).toHaveBeenCalledWith('https://key@sentry.io/123/store/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'mcp-check-telemetry',
        },
        body: expect.stringContaining('"environment":"test"'),
      });
    });

    it('does not send when disabled', async () => {
      const provider = new SentryProvider(
        { enabled: false, dsn: 'https://key@sentry.io/123' },
        mockLogger,
      );

      await provider.send({} as any);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sets level to warning when tests fail', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const provider = new SentryProvider(
        { enabled: true, dsn: 'https://key@sentry.io/123' },
        mockLogger,
      );

      const telemetryData = {
        testRun: { id: 'test-123', timestamp: '2024-01-01T00:00:00Z', duration: 100, success: false },
        environment: { mcpCheckVersion: '1.0.0', nodeVersion: 'v20', platform: 'darwin', architecture: 'x64' },
        target: { type: 'stdio' },
        results: { total: 5, passed: 3, failed: 2, skipped: 0, warnings: 0 },
        performance: {},
      };

      await provider.send(telemetryData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"level":"warning"'),
        }),
      );
    });
  });

  describe('TelemetryManager', () => {
    it('initializes with no providers when telemetry is not configured', () => {
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
      };

      const manager = new TelemetryManager(config, mockLogger);
      expect(manager.isEnabled()).toBe(false);
      expect(manager.getEnabledProviders()).toEqual([]);
    });

    it('initializes OpenTelemetry provider when configured', () => {
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
        telemetry: {
          opentelemetry: {
            enabled: true,
            endpoint: 'http://localhost:4318',
          },
        },
      };

      const manager = new TelemetryManager(config, mockLogger);
      expect(manager.isEnabled()).toBe(true);
      expect(manager.getEnabledProviders()).toContain('opentelemetry');
    });

    it('initializes Sentry provider when configured', () => {
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
        telemetry: {
          sentry: {
            enabled: true,
            dsn: 'https://key@sentry.io/123',
          },
        },
      };

      const manager = new TelemetryManager(config, mockLogger);
      expect(manager.isEnabled()).toBe(true);
      expect(manager.getEnabledProviders()).toContain('sentry');
    });

    it('initializes multiple providers', () => {
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
        telemetry: {
          opentelemetry: {
            enabled: true,
            endpoint: 'http://localhost:4318',
          },
          sentry: {
            enabled: true,
            dsn: 'https://key@sentry.io/123',
          },
        },
      };

      const manager = new TelemetryManager(config, mockLogger);
      expect(manager.isEnabled()).toBe(true);
      expect(manager.getEnabledProviders()).toHaveLength(2);
    });

    it('sends telemetry to all enabled providers', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
        telemetry: {
          opentelemetry: {
            enabled: true,
            endpoint: 'http://localhost:4318',
          },
          sentry: {
            enabled: true,
            dsn: 'https://key@sentry.io/123',
          },
        },
      };

      const manager = new TelemetryManager(config, mockLogger);
      await manager.sendTelemetry(createMockTestResults());

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not send telemetry when no providers are enabled', async () => {
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
      };

      const manager = new TelemetryManager(config, mockLogger);
      await manager.sendTelemetry(createMockTestResults());

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('No telemetry providers enabled');
    });

    it('handles provider failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: './reports',
        telemetry: {
          opentelemetry: {
            enabled: true,
            endpoint: 'http://localhost:4318',
          },
        },
      };

      const manager = new TelemetryManager(config, mockLogger);

      // Should not throw
      await expect(manager.sendTelemetry(createMockTestResults())).resolves.toBeUndefined();
    });

    describe('redaction', () => {
      it('redacts non-allowed fields by default', async () => {
        mockFetch.mockResolvedValue({ ok: true });

        const config: ReportingConfig = {
          formats: ['json'],
          outputDir: './reports',
          telemetry: {
            opentelemetry: {
              enabled: true,
              endpoint: 'http://localhost:4318',
            },
          },
        };

        const manager = new TelemetryManager(config, mockLogger);
        await manager.sendTelemetry(createMockTestResults());

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Non-allowed field keys get replaced with [REDACTED]
        // 'testRun', 'environment', 'target', 'results', 'performance' are top-level keys
        // that aren't in the default allowed list
        expect(sentBody.data.testRun).toBe('[REDACTED]');
        expect(sentBody.data.environment).toBe('[REDACTED]');
        expect(sentBody.data.target).toBe('[REDACTED]');
        expect(sentBody.data.results).toBe('[REDACTED]');
        expect(sentBody.data.performance).toBe('[REDACTED]');
      });

      it('preserves allowed fields when configured', async () => {
        mockFetch.mockResolvedValue({ ok: true });

        const config: ReportingConfig = {
          formats: ['json'],
          outputDir: './reports',
          redaction: {
            enabled: true,
            allowedFields: ['testRun', 'results', 'total', 'passed', 'failed', 'skipped', 'success', 'id', 'timestamp', 'duration'],
          },
          telemetry: {
            opentelemetry: {
              enabled: true,
              endpoint: 'http://localhost:4318',
            },
          },
        };

        const manager = new TelemetryManager(config, mockLogger);
        await manager.sendTelemetry(createMockTestResults());

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        // With custom allowed fields, these nested fields should be preserved
        expect(sentBody.data.results.total).toBe(10);
        expect(sentBody.data.results.passed).toBe(8);
        expect(sentBody.data.results.failed).toBe(1);
      });

      it('can be disabled', async () => {
        mockFetch.mockResolvedValue({ ok: true });

        const config: ReportingConfig = {
          formats: ['json'],
          outputDir: './reports',
          redaction: {
            enabled: false,
          },
          telemetry: {
            opentelemetry: {
              enabled: true,
              endpoint: 'http://localhost:4318',
            },
          },
        };

        const manager = new TelemetryManager(config, mockLogger);
        await manager.sendTelemetry(createMockTestResults());

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        // With redaction disabled, everything should be sent
        expect(sentBody.data.results.total).toBe(10);
        expect(sentBody.data.testRun.success).toBe(false);
      });
    });

    describe('performance metrics', () => {
      it('calculates average response time', async () => {
        mockFetch.mockResolvedValue({ ok: true });

        const config: ReportingConfig = {
          formats: ['json'],
          outputDir: './reports',
          redaction: {
            enabled: false,
          },
          telemetry: {
            opentelemetry: {
              enabled: true,
              endpoint: 'http://localhost:4318',
            },
          },
        };

        const manager = new TelemetryManager(config, mockLogger);
        await manager.sendTelemetry(createMockTestResults());

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        // Average of 100, 200, 150 = 150
        expect(sentBody.data.performance.averageResponseTime).toBe(150);
      });

      it('calculates throughput', async () => {
        mockFetch.mockResolvedValue({ ok: true });

        const config: ReportingConfig = {
          formats: ['json'],
          outputDir: './reports',
          redaction: {
            enabled: false,
          },
          telemetry: {
            opentelemetry: {
              enabled: true,
              endpoint: 'http://localhost:4318',
            },
          },
        };

        const manager = new TelemetryManager(config, mockLogger);
        await manager.sendTelemetry(createMockTestResults());

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        // 3 tests in 500ms = 6 tests/second
        expect(sentBody.data.performance.throughput).toBe(6);
      });

      it('handles empty test results', async () => {
        mockFetch.mockResolvedValue({ ok: true });

        const config: ReportingConfig = {
          formats: ['json'],
          outputDir: './reports',
          redaction: {
            enabled: false,
          },
          telemetry: {
            opentelemetry: {
              enabled: true,
              endpoint: 'http://localhost:4318',
            },
          },
        };

        const emptyResults = createMockTestResults({
          suites: [],
        });

        const manager = new TelemetryManager(config, mockLogger);
        await manager.sendTelemetry(emptyResults);

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(sentBody.data.performance).toEqual({});
      });
    });
  });
});
