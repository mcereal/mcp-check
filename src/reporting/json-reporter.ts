/**
 * JSON reporter implementation
 */

import { ReportOutput } from '../types/reporting';
import { TestResults } from '../types/test';
import { BaseReporter } from './base-reporter';

export class JsonReporter extends BaseReporter {
  constructor(config: any) {
    super('json', config);
  }

  async generate(results: TestResults): Promise<ReportOutput> {
    const redactedResults = this.redactResults(results);

    // Enhance the results with additional metadata for JSON format
    const enhancedResults = {
      version: '1.0.0',
      ...redactedResults,
      analysis: {
        successRate: this.calculateSuccessRate(results.summary),
        criticalFailures: this.getCriticalFailures(results),
        performanceMetrics: this.extractPerformanceMetrics(results),
        chaosImpact: this.analyzeChaosImpact(results),
      },
    };

    const content = JSON.stringify(enhancedResults, null, 2);

    return {
      format: 'json',
      filename: 'results.json',
      content,
      metadata: {
        size: content.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private getCriticalFailures(results: TestResults) {
    const criticalFailures: any[] = [];

    for (const suite of results.suites) {
      for (const testCase of suite.cases) {
        if (testCase.status === 'failed' && this.isCritical(testCase)) {
          criticalFailures.push({
            suite: suite.name,
            test: testCase.name,
            error: testCase.error,
            fixture: testCase.error?.fixture,
          });
        }
      }
    }

    return criticalFailures;
  }

  private isCritical(testCase: any): boolean {
    // Consider failures in core protocol functionality as critical
    const criticalSuites = ['handshake', 'tool-discovery'];
    return criticalSuites.some((suite) => testCase.name.includes(suite));
  }

  private extractPerformanceMetrics(results: TestResults) {
    const metrics = {
      totalDuration: results.metadata.durationMs,
      averageTestDuration: 0,
      slowestTests: [] as any[],
      fastestTests: [] as any[],
    };

    const allTests: any[] = [];
    for (const suite of results.suites) {
      for (const testCase of suite.cases) {
        allTests.push({
          name: `${suite.name}.${testCase.name}`,
          duration: testCase.durationMs,
        });
      }
    }

    if (allTests.length > 0) {
      metrics.averageTestDuration =
        allTests.reduce((sum, test) => sum + test.duration, 0) /
        allTests.length;

      // Sort by duration
      allTests.sort((a, b) => b.duration - a.duration);
      metrics.slowestTests = allTests.slice(0, 5);
      metrics.fastestTests = allTests.slice(-5).reverse();
    }

    return metrics;
  }

  private analyzeChaosImpact(results: TestResults) {
    const chaosTests = results.suites.filter(
      (suite) =>
        suite.name.includes('chaos') ||
        suite.cases.some((c) => c.details?.chaosEnabled),
    );

    return {
      chaosTestsRun: chaosTests.length,
      chaosFailures: chaosTests.filter((s) => s.status === 'failed').length,
      chaosSuccessRate:
        chaosTests.length > 0
          ? (chaosTests.filter((s) => s.status === 'passed').length /
              chaosTests.length) *
            100
          : 0,
    };
  }
}
