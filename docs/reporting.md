# MCP Check Reporting System

The MCP Check reporting system provides comprehensive test result analysis and visualization through multiple output formats. This document describes the reporting architecture and capabilities.

## Overview

The reporting system consists of several key components:

- **Report Manager**: Orchestrates multiple reporters and handles output
- **Format-specific Reporters**: Generate JSON, HTML, JUnit XML, and badge outputs
- **Telemetry Integration**: Optional monitoring and analytics
- **Data Redaction**: Privacy-safe reporting for CI/CD environments

## Supported Report Formats

### JSON Report (`results.json`)

Machine-readable format optimized for CI/CD integration and automated analysis.

**Features:**

- Complete test results with metadata
- Performance metrics and analysis
- Critical failure identification
- Chaos engineering impact analysis
- Reproducible test fixtures

**Example Usage:**

```json
{
  "version": "1.0.0",
  "summary": {
    "total": 25,
    "passed": 23,
    "failed": 2,
    "skipped": 0,
    "warnings": 1
  },
  "analysis": {
    "successRate": 92,
    "criticalFailures": [...],
    "performanceMetrics": {...},
    "chaosImpact": {...}
  }
}
```

### HTML Report (`index.html`)

Interactive dashboard with charts, expandable test details, and visual indicators.

**Features:**

- Executive summary with visual metrics
- Interactive test suite drill-down
- Performance charts (Chart.js)
- Error details with stack traces
- Test fixture links for reproduction
- Mobile-responsive design

**Key Components:**

- Summary cards showing pass/fail statistics
- Performance charts showing test durations
- Expandable test suite sections
- Error details with reproduction commands

### JUnit XML (`junit.xml`)

Standard format for CI/CD pipeline integration compatible with Jenkins, GitLab CI, GitHub Actions, and other platforms.

**Features:**

- Standard JUnit XML schema
- Test suite and case hierarchy
- Failure and error details
- Proper XML escaping
- Time measurements in seconds

**Example Structure:**

```xml
<testsuites name="mcp-check" tests="25" failures="2">
  <testsuite name="handshake" tests="5" failures="0">
    <testcase name="protocol-negotiation" time="0.567"/>
  </testsuite>
</testsuites>
```

### Badge Data (`badge.json`)

Shields.io compatible badge data for README integration.

**Features:**

- Automatic color coding based on results
- Pass/fail ratio display
- Cacheable for performance
- Multiple badge styles supported

**Color Logic:**

- 🟢 **Green**: All tests passed, no warnings
- 🟡 **Yellow**: All tests passed, but warnings present
- 🟠 **Orange**: 80%+ success rate
- 🔴 **Red**: <80% success rate

## Configuration

Configure reporting through the `reporting` section of your `mcp-check.config.json`:

```json
{
  "reporting": {
    "formats": ["html", "json", "junit", "badge"],
    "outputDir": "./reports",
    "includeFixtures": true,
    "redaction": {
      "enabled": true,
      "allowedFields": ["name", "status", "durationMs"],
      "patterns": ["secret.*", "password.*"]
    },
    "telemetry": {
      "opentelemetry": {
        "enabled": false,
        "endpoint": "https://your-otel-collector",
        "serviceName": "mcp-check"
      },
      "sentry": {
        "enabled": false,
        "dsn": "https://your-sentry-dsn",
        "environment": "production"
      }
    }
  }
}
```

## Data Redaction

The reporting system includes built-in data redaction for privacy and security:

### Automatic Redaction

- Sensitive field names (password, secret, token, key)
- Configurable pattern matching
- Allowlist-based field filtering

### Configuration

```json
{
  "redaction": {
    "enabled": true,
    "allowedFields": [
      "name",
      "status",
      "durationMs",
      "message",
      "type",
      "total",
      "passed",
      "failed",
      "skipped",
      "warnings"
    ],
    "patterns": ["secret.*", "password.*", "token.*", "api[_-]?key.*"]
  }
}
```

## Telemetry Integration

Optional telemetry integration provides insights into test execution patterns and performance.

### OpenTelemetry

Send structured telemetry data to OpenTelemetry-compatible collectors:

```json
{
  "telemetry": {
    "opentelemetry": {
      "enabled": true,
      "endpoint": "https://otel-collector.example.com/v1/traces",
      "serviceName": "mcp-check-ci"
    }
  }
}
```

### Sentry

Send test execution events and errors to Sentry for monitoring:

```json
{
  "telemetry": {
    "sentry": {
      "enabled": true,
      "dsn": "https://your-sentry-dsn@sentry.io/project",
      "environment": "production"
    }
  }
}
```

### Privacy Considerations

- All telemetry data is subject to redaction rules
- Target configuration details are always redacted
- Only aggregate performance metrics are included
- No test input/output data is transmitted

## Test Fixtures

The reporting system automatically generates reproducible test fixtures for failed tests:

### Fixture Structure

```json
{
  "id": "streaming-delta-ordering-001",
  "description": "Out of order delta sequence reproduction",
  "timestamp": "2025-08-08T14:23:42.567Z",
  "chaosConfig": {
    "seed": 12345,
    "streamChunkJitterMs": [10, 50]
  },
  "reproduction": {
    "command": "npx mcp-check --fixture fixtures/streaming-delta-ordering-001.json"
  }
}
```

### Usage

Fixtures can be used to reproduce test failures:

```bash
# Reproduce a specific test scenario
npx mcp-check --fixture ./reports/fixtures/streaming-001.json

# Run with the same chaos seed for reproducibility
CHAOS_SEED=12345 npx mcp-check --suites streaming
```

## CLI Integration

Generate reports through CLI options:

```bash
# Specify output formats
mcp-check --format json,html,junit

# Custom output directory
mcp-check --output-dir ./custom-reports

# Include test fixtures
mcp-check --include-fixtures

# Enable telemetry
mcp-check --telemetry
```

## CI/CD Integration Examples

### GitHub Actions

```yaml
- name: Run MCP Tests
  run: npx mcp-check --format junit,badge --output-dir ./reports

- name: Publish Test Results
  uses: dorny/test-reporter@v1
  if: always()
  with:
    name: MCP Conformance Tests
    path: reports/junit.xml
    reporter: java-junit

- name: Update Badge
  run: |
    BADGE_URL=$(cat reports/badge.json | jq -r '.shieldsIoUrl')
    echo "BADGE_URL=$BADGE_URL" >> $GITHUB_ENV
```

### GitLab CI

```yaml
test:mcp-conformance:
  script:
    - npx mcp-check --format junit --output-dir reports
  artifacts:
    reports:
      junit: reports/junit.xml
    paths:
      - reports/
    expire_in: 30 days
```

### Jenkins

```groovy
pipeline {
  stages {
    stage('MCP Tests') {
      steps {
        sh 'npx mcp-check --format junit,html'
      }
      post {
        always {
          publishTestResults testResultsPattern: 'reports/junit.xml'
          publishHTML([
            allowMissing: false,
            alwaysLinkToLastBuild: true,
            keepAll: true,
            reportDir: 'reports',
            reportFiles: 'index.html',
            reportName: 'MCP Test Report'
          ])
        }
      }
    }
  }
}
```

## Performance Considerations

- **Parallel Generation**: All report formats are generated in parallel
- **Streaming**: Large datasets are processed incrementally
- **Caching**: Badge data includes cache headers for performance
- **Compression**: HTML reports use CDN resources to minimize size

## Troubleshooting

### Common Issues

**Reports not generated:**

- Check output directory permissions
- Verify format configuration
- Review error logs for specific failures

**Missing charts in HTML report:**

- Ensure internet connectivity for CDN resources
- Check browser console for JavaScript errors

**Telemetry not working:**

- Verify endpoint URLs and credentials
- Check network connectivity
- Review redaction configuration

### Debug Commands

```bash
# Enable verbose logging
mcp-check --verbose --debug "mcp:reporting"

# Test report generation only
mcp-check --dry-run --format html

# Validate configuration
mcp-check --validate-config
```

## Extending the System

The reporting system is designed for extensibility:

### Custom Reporters

Implement the `Reporter` interface to create custom output formats:

```typescript
export class CustomReporter implements Reporter {
  readonly format = 'custom';

  async generate(results: TestResults): Promise<ReportOutput> {
    // Your implementation here
  }

  validate(config: ReportingConfig): boolean {
    // Configuration validation
  }
}
```

### Custom Telemetry Providers

Implement the `TelemetryProvider` interface for custom analytics:

```typescript
export class CustomTelemetryProvider implements TelemetryProvider {
  name = 'custom';

  async send(data: TelemetryData): Promise<void> {
    // Send telemetry to your system
  }

  isEnabled(): boolean {
    // Check if provider is configured
  }
}
```
