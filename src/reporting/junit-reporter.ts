/**
 * JUnit XML reporter implementation
 */

import {
  ReportOutput,
  JUnitTestSuite,
  JUnitTestCase,
} from '../types/reporting';
import { TestResults, TestSuiteResult, TestCaseResult } from '../types/test';
import { BaseReporter } from './base-reporter';

export class JunitReporter extends BaseReporter {
  constructor(config: any) {
    super('junit', config);
  }

  async generate(results: TestResults): Promise<ReportOutput> {
    const redactedResults = this.redactResults(results);
    const junitSuites = this.convertToJunitFormat(redactedResults);
    const xml = this.generateXml(junitSuites, redactedResults);

    return {
      format: 'junit',
      filename: 'junit.xml',
      content: xml,
      metadata: {
        size: xml.length,
        timestamp: new Date().toISOString(),
        suites: junitSuites.length,
        tests: junitSuites.reduce((sum, suite) => sum + suite.tests, 0),
      },
    };
  }

  private convertToJunitFormat(results: TestResults): JUnitTestSuite[] {
    return results.suites.map((suite) => this.convertSuite(suite));
  }

  private convertSuite(suite: TestSuiteResult): JUnitTestSuite {
    const testcases = suite.cases.map((testCase) =>
      this.convertTestCase(testCase, suite.name),
    );

    return {
      name: suite.name,
      tests: suite.cases.length,
      failures: suite.cases.filter((c) => c.status === 'failed').length,
      errors: 0, // We treat all failures as failures, not errors
      skipped: suite.cases.filter((c) => c.status === 'skipped').length,
      time: suite.durationMs / 1000, // Convert to seconds
      testcases,
    };
  }

  private convertTestCase(
    testCase: TestCaseResult,
    suiteName: string,
  ): JUnitTestCase {
    const junitCase: JUnitTestCase = {
      name: testCase.name,
      classname: suiteName,
      time: testCase.durationMs / 1000, // Convert to seconds
    };

    if (testCase.status === 'failed' && testCase.error) {
      junitCase.failure = {
        message: testCase.error.message,
        content: this.formatFailureContent(testCase.error),
      };
    }

    if (testCase.status === 'skipped') {
      junitCase.skipped = true;
    }

    return junitCase;
  }

  private formatFailureContent(error: any): string {
    let content = `Type: ${error.type}\nMessage: ${error.message}`;

    if (error.details) {
      content += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }

    if (error.fixture) {
      content += `\nFixture: ${error.fixture}`;
      content += `\nTo reproduce: npx mcp-check --fixture ${error.fixture}`;
    }

    if (error.stack) {
      content += `\nStack trace:\n${error.stack}`;
    }

    return content;
  }

  private generateXml(suites: JUnitTestSuite[], results: TestResults): string {
    const totalTests = suites.reduce((sum, suite) => sum + suite.tests, 0);
    const totalFailures = suites.reduce(
      (sum, suite) => sum + suite.failures,
      0,
    );
    const totalErrors = suites.reduce((sum, suite) => sum + suite.errors, 0);
    const totalTime = results.metadata.durationMs / 1000;

    const xmlParts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites name="mcp-check" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" time="${totalTime.toFixed(3)}" timestamp="${results.metadata.startedAt}">`,
      ...suites.map((suite) => this.generateSuiteXml(suite)),
      '</testsuites>',
    ];

    return xmlParts.join('\n');
  }

  private generateSuiteXml(suite: JUnitTestSuite): string {
    const suiteAttrs = [
      `name="${this.escapeXml(suite.name)}"`,
      `tests="${suite.tests}"`,
      `failures="${suite.failures}"`,
      `errors="${suite.errors}"`,
      `skipped="${suite.skipped}"`,
      `time="${suite.time.toFixed(3)}"`,
    ].join(' ');

    const testcases = suite.testcases.map((testcase) =>
      this.generateTestcaseXml(testcase),
    );

    return [
      `  <testsuite ${suiteAttrs}>`,
      ...testcases.map((tc) => `    ${tc}`),
      '  </testsuite>',
    ].join('\n');
  }

  private generateTestcaseXml(testcase: JUnitTestCase): string {
    const attrs = [
      `name="${this.escapeXml(testcase.name)}"`,
      `classname="${this.escapeXml(testcase.classname)}"`,
      `time="${testcase.time.toFixed(3)}"`,
    ].join(' ');

    if (testcase.skipped) {
      return `<testcase ${attrs}>\n      <skipped/>\n    </testcase>`;
    }

    if (testcase.failure) {
      const failureContent = this.escapeXml(testcase.failure.content);
      const failureMessage = this.escapeXml(testcase.failure.message);
      return [
        `<testcase ${attrs}>`,
        `      <failure message="${failureMessage}">`,
        `        ${failureContent}`,
        '      </failure>',
        '    </testcase>',
      ].join('\n');
    }

    if (testcase.error) {
      const errorContent = this.escapeXml(testcase.error.content);
      const errorMessage = this.escapeXml(testcase.error.message);
      return [
        `<testcase ${attrs}>`,
        `      <error message="${errorMessage}">`,
        `        ${errorContent}`,
        '      </error>',
        '    </testcase>',
      ].join('\n');
    }

    return `<testcase ${attrs}/>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
