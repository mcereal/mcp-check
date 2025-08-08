/**
 * Unit tests for ReportManager
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReportManager } from '../../../src/reporting/report-manager';
import { TestResults } from '../../../src/types/test';
import { ReportingConfig } from '../../../src/types/config';
import { Logger } from '../../../src/types/reporting';
import { createTempDir, cleanupTempDir } from '../../helpers/test-utils';

describe('ReportManager', () => {
  let reportManager: ReportManager;
  let tempDir: string;
  let mockLogger: jest.Mocked<Logger>;
  let sampleResults: TestResults;

  beforeEach(() => {
    tempDir = createTempDir();

    const createMockLogger = (): jest.Mocked<Logger> => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockImplementation(() => createMockLogger()),
    });

    mockLogger = createMockLogger();

    const config: ReportingConfig = {
      formats: ['json', 'html'],
      outputDir: tempDir,
      includeFixtures: false,
    };

    reportManager = new ReportManager(config, mockLogger);

    // Sample test results
    sampleResults = {
      summary: {
        total: 5,
        passed: 3,
        failed: 1,
        skipped: 1,
        warnings: 0,
      },
      suites: [
        {
          name: 'handshake',
          status: 'passed',
          durationMs: 150,
          cases: [
            {
              name: 'connection-test',
              status: 'passed',
              durationMs: 50,
              details: { message: 'Connected successfully' },
            },
            {
              name: 'version-test',
              status: 'passed',
              durationMs: 100,
              details: { version: '2024-11-05' },
            },
          ],
        },
        {
          name: 'tool-discovery',
          status: 'failed',
          durationMs: 200,
          cases: [
            {
              name: 'list-tools',
              status: 'failed',
              durationMs: 200,
              error: {
                type: 'DiscoveryError',
                message: 'Failed to list tools',
              },
            },
          ],
        },
      ],
      fixtures: [],
      metadata: {
        mcpCheckVersion: '1.0.0',
        startedAt: '2023-01-01T00:00:00.000Z',
        completedAt: '2023-01-01T00:01:00.000Z',
        durationMs: 60000,
        environment: {
          platform: 'test',
          nodeVersion: '20.0.0',
          architecture: 'x64',
        },
      },
    };
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with valid configuration', () => {
      expect(reportManager).toBeDefined();
    });

    it('should create output directory when generating reports', async () => {
      const newDir = path.join(tempDir, 'new-reports');
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: newDir,
      };

      expect(fs.existsSync(newDir)).toBe(false);
      const manager = new ReportManager(config, mockLogger);
      await manager.generateReports(sampleResults);
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  describe('Report Generation', () => {
    it('should generate JSON report', async () => {
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(sampleResults);

      const jsonPath = path.join(tempDir, 'results.json');
      expect(fs.existsSync(jsonPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(content.summary.total).toBe(5);
      expect(content.summary.passed).toBe(3);
      expect(content.summary.failed).toBe(1);
    });

    it('should generate HTML report', async () => {
      const config: ReportingConfig = {
        formats: ['html'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(sampleResults);

      const htmlPath = path.join(tempDir, 'index.html');
      expect(fs.existsSync(htmlPath)).toBe(true);

      const content = fs.readFileSync(htmlPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('MCP Check Test Results');
    });

    it('should generate JUnit report', async () => {
      const config: ReportingConfig = {
        formats: ['junit'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(sampleResults);

      const junitPath = path.join(tempDir, 'junit.xml');
      expect(fs.existsSync(junitPath)).toBe(true);

      const content = fs.readFileSync(junitPath, 'utf-8');
      expect(content).toContain('<?xml version="1.0"');
      expect(content).toContain('<testsuites');
      expect(content).toContain('tests="3"');
    });

    it('should generate badge report', async () => {
      const config: ReportingConfig = {
        formats: ['badge'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(sampleResults);

      const badgePath = path.join(tempDir, 'badge.json');
      expect(fs.existsSync(badgePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(badgePath, 'utf-8'));
      expect(content).toHaveProperty('schemaVersion');
      expect(content).toHaveProperty('label');
      expect(content).toHaveProperty('message');
      expect(content).toHaveProperty('color');
    });

    it('should generate multiple report formats', async () => {
      const config: ReportingConfig = {
        formats: ['json', 'html', 'junit'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(sampleResults);

      expect(fs.existsSync(path.join(tempDir, 'results.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'junit.xml'))).toBe(true);
    });

    it('should handle empty formats array', async () => {
      const config: ReportingConfig = {
        formats: [],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(sampleResults);

      // Should not generate any files
      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(0);
    });

    it('should skip unknown formats', async () => {
      const config: ReportingConfig = {
        formats: ['json', 'unknown-format' as any],
        outputDir: tempDir,
      };

      // Create a fresh manager to test unknown format handling
      const manager = new ReportManager(config, mockLogger);
      await manager.generateReports(sampleResults);

      // Should generate JSON but skip unknown format
      expect(fs.existsSync(path.join(tempDir, 'results.json'))).toBe(true);

      // Only JSON file should be created (unknown format skipped)
      const files = fs.readdirSync(tempDir);
      expect(files).toEqual(['results.json']);
    });
  });

  describe('Error Handling', () => {
    it('should handle write permission errors', async () => {
      // Make directory read-only
      fs.chmodSync(tempDir, 0o444);

      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await expect(manager.generateReports(sampleResults)).rejects.toThrow();

      // Restore permissions for cleanup
      fs.chmodSync(tempDir, 0o755);
    });

    it('should handle individual reporter failures gracefully', async () => {
      const config: ReportingConfig = {
        formats: ['json', 'html'],
        outputDir: '/invalid/path/that/does/not/exist',
      };
      const manager = new ReportManager(config, mockLogger);

      await expect(manager.generateReports(sampleResults)).rejects.toThrow();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should use default output directory if not specified', () => {
      const config: ReportingConfig = {
        formats: ['json'],
        // outputDir not specified
      };

      const manager = new ReportManager(config, mockLogger);
      expect(manager).toBeDefined();
    });

    it('should handle relative output paths', async () => {
      const relativePath = './test-reports';
      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: relativePath,
      };

      const manager = new ReportManager(config, mockLogger);
      await manager.generateReports(sampleResults); // Clean up the created directory
      if (fs.existsSync(relativePath)) {
        fs.rmSync(relativePath, { recursive: true });
      }
    });

    it('should handle formats specified as undefined', async () => {
      const config: ReportingConfig = {
        formats: undefined as any,
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      // Should not crash
      await expect(
        manager.generateReports(sampleResults),
      ).resolves.not.toThrow();
    });
  });

  describe('Report Content Validation', () => {
    it('should include fixture information when enabled', async () => {
      const resultsWithFixtures: TestResults = {
        ...sampleResults,
        fixtures: [
          {
            id: 'test-fixture-1',
            description: 'Test fixture',
            timestamp: '2023-01-01T00:00:00.000Z',
            target: { type: 'stdio', command: 'test', args: [] },
            scenario: {
              expectedBehavior: 'Should work',
              actualBehavior: 'Did not work',
            },
            reproduction: {
              command: 'mcp-check --fixture test-fixture-1',
            },
          },
        ],
      };

      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: tempDir,
        includeFixtures: true,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(resultsWithFixtures);

      const jsonPath = path.join(tempDir, 'results.json');
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

      expect(content.fixtures).toHaveLength(1);
      expect(content.fixtures[0].id).toBe('test-fixture-1');
    });

    it('should exclude fixtures when disabled', async () => {
      const resultsWithFixtures: TestResults = {
        ...sampleResults,
        fixtures: [
          {
            id: 'test-fixture-1',
            description: 'Test fixture',
            timestamp: '2023-01-01T00:00:00.000Z',
            target: { type: 'stdio', command: 'test', args: [] },
            scenario: {
              expectedBehavior: 'Should work',
              actualBehavior: 'Did not work',
            },
            reproduction: {
              command: 'mcp-check --fixture test-fixture-1',
            },
          },
        ],
      };

      const config: ReportingConfig = {
        formats: ['json'],
        outputDir: tempDir,
        includeFixtures: false,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(resultsWithFixtures);

      const jsonPath = path.join(tempDir, 'results.json');
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

      expect(content.fixtures).toHaveLength(0);
    });

    it('should handle test results with warnings', async () => {
      const resultsWithWarnings: TestResults = {
        ...sampleResults,
        summary: {
          ...sampleResults.summary,
          warnings: 2,
        },
        suites: [
          {
            name: 'test-suite',
            status: 'passed',
            durationMs: 100,
            cases: [
              {
                name: 'warning-test',
                status: 'warning',
                durationMs: 100,
                details: { message: 'This is a warning' },
              },
            ],
          },
        ],
      };

      const config: ReportingConfig = {
        formats: ['json', 'html'],
        outputDir: tempDir,
      };
      const manager = new ReportManager(config, mockLogger);

      await manager.generateReports(resultsWithWarnings);

      const jsonPath = path.join(tempDir, 'results.json');
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(content.summary.warnings).toBe(2);

      const htmlPath = path.join(tempDir, 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      expect(htmlContent).toContain('warning');
    });
  });
});
