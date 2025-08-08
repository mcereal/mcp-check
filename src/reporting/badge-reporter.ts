/**
 * Badge reporter implementation for shields.io compatible badges
 */

import { ReportOutput, BadgeData } from '../types/reporting';
import { TestResults } from '../types/test';
import { BaseReporter } from './base-reporter';

export class BadgeReporter extends BaseReporter {
  constructor(config: any) {
    super('badge', config);
  }

  async generate(results: TestResults): Promise<ReportOutput> {
    const redactedResults = this.redactResults(results);
    const badgeData = this.generateBadgeData(redactedResults);
    const content = JSON.stringify(badgeData, null, 2);

    return {
      format: 'badge',
      filename: 'badge.json',
      content,
      metadata: {
        size: content.length,
        timestamp: new Date().toISOString(),
        shieldsIoUrl: this.generateShieldsUrl(badgeData),
      },
    };
  }

  private generateBadgeData(results: TestResults): BadgeData {
    const { summary } = results;
    const successRate = this.calculateSuccessRate(summary);

    return {
      schemaVersion: 1,
      label: 'mcp-check',
      message: this.generateMessage(summary),
      color: this.determineColor(summary, successRate),
      cacheSeconds: 300,
      style: 'flat-square',
    };
  }

  private generateMessage(summary: TestResults['summary']): string {
    if (summary.total === 0) {
      return 'no tests';
    }

    if (summary.failed === 0 && summary.warnings === 0) {
      return `${summary.passed}/${summary.total} passed`;
    }

    if (summary.failed === 0) {
      return `${summary.passed}/${summary.total} passed (${summary.warnings} warnings)`;
    }

    return `${summary.passed}/${summary.total} passed`;
  }

  private determineColor(
    summary: TestResults['summary'],
    successRate: number,
  ): string {
    if (summary.total === 0) {
      return 'lightgrey';
    }

    if (summary.failed === 0 && summary.warnings === 0) {
      return 'brightgreen';
    }

    if (summary.failed === 0 && summary.warnings > 0) {
      return 'yellow';
    }

    if (successRate >= 80) {
      return 'orange';
    }

    if (successRate >= 50) {
      return 'red';
    }

    return 'critical';
  }

  private generateShieldsUrl(badgeData: BadgeData): string {
    const params = new URLSearchParams({
      label: badgeData.label,
      message: badgeData.message,
      color: badgeData.color,
      style: badgeData.style || 'flat-square',
    });

    return `https://img.shields.io/static/v1?${params.toString()}`;
  }
}
