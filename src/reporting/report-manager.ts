/**
 * Report manager for coordinating multiple reporters
 */

import fs from 'fs/promises';
import path from 'path';
import { Reporter, ReportFormat, ReportOutput } from '../types/reporting';
import { TestResults } from '../types/test';
import { ReportingConfig } from '../types/config';
import { Logger } from '../types/reporting';
import { JsonReporter } from './json-reporter';
import { HtmlReporter } from './html-reporter';
import { JunitReporter } from './junit-reporter';
import { BadgeReporter } from './badge-reporter';

export class ReportManager {
  private reporters: Map<ReportFormat, Reporter> = new Map();
  private logger: Logger;

  constructor(
    private config: ReportingConfig,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ReportManager' });
    this.initializeReporters();
  }

  private initializeReporters(): void {
    const formats = this.config.formats || ['html', 'json'];

    for (const format of formats) {
      let reporter: Reporter;

      switch (format) {
        case 'json':
          reporter = new JsonReporter(this.config);
          break;
        case 'html':
          reporter = new HtmlReporter(this.config);
          break;
        case 'junit':
          reporter = new JunitReporter(this.config);
          break;
        case 'badge':
          reporter = new BadgeReporter(this.config);
          break;
        default:
          this.logger.warn(`Unknown report format: ${format}`);
          continue;
      }

      if (reporter.validate(this.config)) {
        this.reporters.set(format, reporter);
        this.logger.debug(`Initialized ${format} reporter`);
      } else {
        this.logger.warn(
          `Failed to validate configuration for ${format} reporter`,
        );
      }
    }
  }

  async generateReports(results: TestResults): Promise<ReportOutput[]> {
    const outputDir = this.config.outputDir || './reports';
    await this.ensureOutputDirectory(outputDir);

    const reports: ReportOutput[] = [];
    const reportPromises: Promise<ReportOutput>[] = [];

    // Generate all reports in parallel
    for (const [format, reporter] of this.reporters) {
      this.logger.debug(`Generating ${format} report`);
      const reportPromise = reporter.generate(results).catch((error) => {
        this.logger.error(`Failed to generate ${format} report`, { error });
        throw error;
      });
      reportPromises.push(reportPromise);
    }

    try {
      const generatedReports = await Promise.all(reportPromises);

      // Write all reports to disk
      const writePromises = generatedReports.map((report) =>
        this.writeReport(report, outputDir),
      );

      await Promise.all(writePromises);
      reports.push(...generatedReports);

      this.logger.info(`Generated ${reports.length} reports in ${outputDir}`);

      // Copy static assets for HTML reports if needed
      if (this.reporters.has('html')) {
        await this.copyStaticAssets(outputDir);
      }
    } catch (error) {
      this.logger.error('Failed to generate reports', { error });
      throw error;
    }

    return reports;
  }

  private async ensureOutputDirectory(outputDir: string): Promise<void> {
    try {
      await fs.access(outputDir);
    } catch {
      await fs.mkdir(outputDir, { recursive: true });
      this.logger.debug(`Created output directory: ${outputDir}`);
    }
  }

  private async writeReport(
    report: ReportOutput,
    outputDir: string,
  ): Promise<void> {
    const filePath = path.join(outputDir, report.filename);

    try {
      if (typeof report.content === 'string') {
        await fs.writeFile(filePath, report.content, 'utf8');
      } else {
        await fs.writeFile(filePath, report.content);
      }

      this.logger.debug(`Wrote ${report.format} report to ${filePath}`, {
        size: report.metadata?.size,
        format: report.format,
      });
    } catch (error) {
      this.logger.error(`Failed to write ${report.format} report`, {
        error,
        filePath,
      });
      throw error;
    }
  }

  private async copyStaticAssets(outputDir: string): Promise<void> {
    // For now, HTML reports are self-contained with CDN resources
    // In the future, we could copy local assets here
    this.logger.debug(
      'HTML report uses CDN resources, no static assets to copy',
    );
  }

  async generateFixtures(results: TestResults): Promise<void> {
    if (!this.config.includeFixtures || !results.fixtures.length) {
      return;
    }

    const outputDir = this.config.outputDir || './reports';
    const fixturesDir = path.join(outputDir, 'fixtures');

    await this.ensureOutputDirectory(fixturesDir);

    const writePromises = results.fixtures.map(async (fixture) => {
      const filename = `${fixture.id}.json`;
      const filePath = path.join(fixturesDir, filename);
      const content = JSON.stringify(fixture, null, 2);

      await fs.writeFile(filePath, content, 'utf8');
      this.logger.debug(`Wrote fixture to ${filePath}`);
    });

    await Promise.all(writePromises);
    this.logger.info(
      `Generated ${results.fixtures.length} test fixtures in ${fixturesDir}`,
    );
  }

  getAvailableFormats(): ReportFormat[] {
    return Array.from(this.reporters.keys());
  }

  hasReporter(format: ReportFormat): boolean {
    return this.reporters.has(format);
  }

  async validateConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.config.formats || this.config.formats.length === 0) {
      errors.push('No report formats specified');
    }

    if (
      this.config.outputDir &&
      !(await this.isWritableDirectory(this.config.outputDir))
    ) {
      errors.push(`Output directory is not writable: ${this.config.outputDir}`);
    }

    if (this.reporters.size === 0) {
      errors.push('No valid reporters initialized');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private async isWritableDirectory(dir: string): Promise<boolean> {
    try {
      await fs.access(dir, fs.constants.W_OK);
      return true;
    } catch {
      try {
        // Try to create the directory if it doesn't exist
        await fs.mkdir(dir, { recursive: true });
        return true;
      } catch {
        return false;
      }
    }
  }
}
