/**
 * HTML reporter implementation
 */

import { ReportOutput, HtmlReportData } from '../types/reporting';
import { TestResults } from '../types/test';
import { BaseReporter } from './base-reporter';

export class HtmlReporter extends BaseReporter {
  constructor(config: any) {
    super('html', config);
  }

  async generate(results: TestResults): Promise<ReportOutput> {
    const redactedResults = this.redactResults(results);
    const reportData = this.prepareReportData(redactedResults);
    const html = this.generateHtml(reportData);

    return {
      format: 'html',
      filename: 'index.html',
      content: html,
      metadata: {
        size: html.length,
        timestamp: new Date().toISOString(),
        interactive: true,
      },
    };
  }

  private prepareReportData(results: TestResults): HtmlReportData {
    return {
      title: 'MCP Check Test Results',
      summary: results.summary,
      suites: results.suites,
      fixtures: results.fixtures,
      metadata: results.metadata,
      charts: {
        performance: this.generatePerformanceData(results),
        timeline: this.generateTimelineData(results),
      },
    };
  }

  private generatePerformanceData(results: TestResults) {
    return results.suites.map((suite) => ({
      name: suite.name,
      duration: suite.durationMs,
      status: suite.status,
      testCount: suite.cases.length,
    }));
  }

  private generateTimelineData(results: TestResults) {
    const timeline: any[] = [];
    let currentTime = new Date(results.metadata.startedAt).getTime();

    for (const suite of results.suites) {
      timeline.push({
        name: suite.name,
        start: currentTime,
        end: currentTime + suite.durationMs,
        status: suite.status,
      });
      currentTime += suite.durationMs;
    }

    return timeline;
  }

  private generateHtml(data: HtmlReportData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    ${this.generateStyles()}
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container">
        ${this.generateHeader(data)}
        ${this.generateSummary(data)}
        ${this.generateCharts(data)}
        ${this.generateSuiteResults(data)}
        ${this.generateFixturesList(data)}
    </div>
    ${this.generateScripts(data)}
</body>
</html>`;
  }

  private generateStyles(): string {
    return `<style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f8fafc;
            color: #334155;
            line-height: 1.6;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 300;
            margin-bottom: 0.5rem;
        }

        .header .subtitle {
            opacity: 0.9;
            font-size: 1.1rem;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .metric-card {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }

        .metric-card .value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.5rem;
        }

        .metric-card .label {
            color: #64748b;
            font-size: 0.9rem;
        }

        .passed { color: #059669; }
        .failed { color: #dc2626; }
        .skipped { color: #d97706; }
        .warnings { color: #ca8a04; }

        .charts {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 2rem;
        }

        .chart-container {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .chart-container h3 {
            margin-bottom: 1rem;
            color: #1e293b;
        }

        .suite {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 1rem;
        }

        .suite-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e2e8f0;
            cursor: pointer;
            display: flex;
            justify-content: between;
            align-items: center;
        }

        .suite-header:hover {
            background-color: #f8fafc;
        }

        .suite-title {
            font-weight: 600;
            font-size: 1.1rem;
        }

        .suite-status {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
        }

        .status-passed {
            background-color: #dcfce7;
            color: #166534;
        }

        .status-failed {
            background-color: #fecaca;
            color: #991b1b;
        }

        .status-warning {
            background-color: #fef3c7;
            color: #92400e;
        }

        .suite-content {
            display: none;
            padding: 1.5rem;
        }

        .suite-content.expanded {
            display: block;
        }

        .test-case {
            padding: 1rem;
            margin-bottom: 0.5rem;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }

        .test-case-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
        }

        .test-name {
            font-weight: 500;
        }

        .test-duration {
            color: #64748b;
            font-size: 0.9rem;
        }

        .error-details {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 4px;
            padding: 1rem;
            margin-top: 1rem;
        }

        .error-message {
            font-weight: 500;
            color: #991b1b;
            margin-bottom: 0.5rem;
        }

        .error-stack {
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.8rem;
            color: #7f1d1d;
            white-space: pre-wrap;
        }

        .fixtures {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-top: 2rem;
        }

        .fixture-item {
            padding: 1rem;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            margin-bottom: 1rem;
        }

        .fixture-id {
            font-weight: 600;
            color: #1e293b;
        }

        .fixture-description {
            color: #64748b;
            margin: 0.5rem 0;
        }

        .fixture-command {
            background-color: #1e293b;
            color: #e2e8f0;
            padding: 0.5rem;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .charts {
                grid-template-columns: 1fr;
            }
            
            .summary {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>`;
  }

  private generateHeader(data: HtmlReportData): string {
    return `
        <div class="header">
            <h1>${data.title}</h1>
            <div class="subtitle">
                Generated on ${this.formatTimestamp(data.metadata.startedAt)} • 
                Duration: ${this.formatDuration(data.metadata.durationMs)}
            </div>
        </div>
    `;
  }

  private generateSummary(data: HtmlReportData): string {
    const { summary } = data;
    const successRate = this.calculateSuccessRate(summary);

    return `
        <div class="summary">
            <div class="metric-card">
                <div class="value">${summary.total}</div>
                <div class="label">Total Tests</div>
            </div>
            <div class="metric-card">
                <div class="value passed">${summary.passed}</div>
                <div class="label">Passed</div>
            </div>
            <div class="metric-card">
                <div class="value failed">${summary.failed}</div>
                <div class="label">Failed</div>
            </div>
            <div class="metric-card">
                <div class="value skipped">${summary.skipped}</div>
                <div class="label">Skipped</div>
            </div>
            <div class="metric-card">
                <div class="value warnings">${summary.warnings}</div>
                <div class="label">Warnings</div>
            </div>
            <div class="metric-card">
                <div class="value">${successRate.toFixed(1)}%</div>
                <div class="label">Success Rate</div>
            </div>
        </div>
    `;
  }

  private generateCharts(data: HtmlReportData): string {
    return `
        <div class="charts">
            <div class="chart-container">
                <h3>Test Suite Performance</h3>
                <canvas id="performanceChart" width="400" height="200"></canvas>
            </div>
            <div class="chart-container">
                <h3>Test Results Distribution</h3>
                <canvas id="distributionChart" width="400" height="200"></canvas>
            </div>
        </div>
    `;
  }

  private generateSuiteResults(data: HtmlReportData): string {
    return `
        <div class="suites">
            <h2>Test Suite Results</h2>
            ${data.suites.map((suite) => this.generateSuiteHtml(suite)).join('')}
        </div>
    `;
  }

  private generateSuiteHtml(suite: any): string {
    const statusClass = `status-${suite.status}`;

    return `
        <div class="suite">
            <div class="suite-header" onclick="toggleSuite('${suite.name}')">
                <div>
                    <span class="suite-title">${suite.name}</span>
                    <span style="margin-left: 1rem; color: #64748b;">
                        ${suite.cases.length} tests • ${this.formatDuration(suite.durationMs)}
                    </span>
                </div>
                <span class="suite-status ${statusClass}">${suite.status}</span>
            </div>
            <div class="suite-content" id="suite-${suite.name}">
                ${suite.cases.map((testCase) => this.generateTestCaseHtml(testCase)).join('')}
            </div>
        </div>
    `;
  }

  private generateTestCaseHtml(testCase: any): string {
    const statusClass = `status-${testCase.status}`;

    return `
        <div class="test-case">
            <div class="test-case-header">
                <span class="test-name">${testCase.name}</span>
                <div>
                    <span class="suite-status ${statusClass}">${testCase.status}</span>
                    <span class="test-duration">${this.formatDuration(testCase.durationMs)}</span>
                </div>
            </div>
            ${testCase.error ? this.generateErrorHtml(testCase.error) : ''}
            ${testCase.warnings?.length ? this.generateWarningsHtml(testCase.warnings) : ''}
        </div>
    `;
  }

  private generateErrorHtml(error: any): string {
    return `
        <div class="error-details">
            <div class="error-message">${error.type}: ${error.message}</div>
            ${error.fixture ? `<div><strong>Fixture:</strong> ${error.fixture}</div>` : ''}
            ${error.stack ? `<pre class="error-stack">${error.stack}</pre>` : ''}
        </div>
    `;
  }

  private generateWarningsHtml(warnings: string[]): string {
    return `
        <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; padding: 0.5rem; margin-top: 0.5rem;">
            <strong>Warnings:</strong>
            <ul>
                ${warnings.map((warning) => `<li>${warning}</li>`).join('')}
            </ul>
        </div>
    `;
  }

  private generateFixturesList(data: HtmlReportData): string {
    if (!data.fixtures.length) {
      return '';
    }

    return `
        <div class="fixtures">
            <h2>Test Fixtures</h2>
            <p>The following fixtures can be used to reproduce test scenarios:</p>
            ${data.fixtures.map((fixture) => this.generateFixtureHtml(fixture)).join('')}
        </div>
    `;
  }

  private generateFixtureHtml(fixture: any): string {
    return `
        <div class="fixture-item">
            <div class="fixture-id">${fixture.id}</div>
            <div class="fixture-description">${fixture.description}</div>
            <div class="fixture-command">${fixture.reproduction.command}</div>
        </div>
    `;
  }

  private generateScripts(data: HtmlReportData): string {
    return `
        <script>
            function toggleSuite(suiteName) {
                const content = document.getElementById('suite-' + suiteName);
                content.classList.toggle('expanded');
            }

            // Initialize charts
            window.addEventListener('load', function() {
                const performanceData = ${JSON.stringify(data.charts?.performance || [])};
                const summaryData = ${JSON.stringify(data.summary)};

                // Performance chart
                const performanceCtx = document.getElementById('performanceChart').getContext('2d');
                new Chart(performanceCtx, {
                    type: 'bar',
                    data: {
                        labels: performanceData.map(d => d.name),
                        datasets: [{
                            label: 'Duration (ms)',
                            data: performanceData.map(d => d.duration),
                            backgroundColor: performanceData.map(d => 
                                d.status === 'passed' ? '#10b981' : 
                                d.status === 'failed' ? '#ef4444' : '#f59e0b'
                            )
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });

                // Distribution chart
                const distributionCtx = document.getElementById('distributionChart').getContext('2d');
                new Chart(distributionCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Passed', 'Failed', 'Skipped', 'Warnings'],
                        datasets: [{
                            data: [summaryData.passed, summaryData.failed, summaryData.skipped, summaryData.warnings],
                            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#f97316']
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { position: 'bottom' }
                        }
                    }
                });
            });
        </script>
    `;
  }
}
