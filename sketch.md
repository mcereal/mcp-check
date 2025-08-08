# mcp-check — Conformance + Fuzz Test CLI and GitHub Action for MCP

**mcp-check** is a comprehensive testing framework for Model Context Protocol (MCP) servers and clients. It verifies spec compliance, tests resilience under stress conditions, and provides reproducible test scenarios for CI/CD pipelines.

## Problem Statement

While MCP has solid SDKs, the ecosystem lacks:

- **Standardized verification**: No common way to test server/client behavior across handshake, streaming, cancellations, errors, and large payloads
- **Reproducible testing**: Missing fixtures to reproduce bugs consistently in CI and vendor pipelines
- **Edge case coverage**: Limited tooling to surface protocol-breaking edge cases early in development

## Goals

1. **Spec Conformance**: Provide clear pass/fail validation for core protocol behaviors
2. **Reproducibility**: Export test fixtures and scenarios that can be reliably run in CI environments
3. **Chaos Engineering**: Surface edge cases through controlled chaos testing (chunking, backpressure, cancellation, timeouts)
4. **Observability**: Optional OpenTelemetry and Sentry integration with PII-safe redaction
5. **Developer Experience**: Enable one-command local testing and one-line GitHub Action integration

## Core Capabilities

- **Protocol Testing**: Handshake validation, capability negotiation, version compatibility
- **Tool Validation**: Discovery and JSON Schema validation of tool inputs/outputs
- **Streaming Tests**: Incremental delta handling, ordering verification, backpressure testing
- **Resilience Testing**: Cancellation handling, timeout behavior, large payload processing
- **Multi-format Reporting**: JSON (machine-readable), HTML (human-friendly), JUnit XML (CI integration)
- **GitHub Action**: Ready-to-use action with `uses: mcereal/mcp-check@v1`

## Quick Start

### Installation

```bash
npm install -g mcp-check
# or use npx for one-time runs
npx mcp-check --version
```

### Basic Usage

1. **Create a configuration file** `mcp-check.config.json`:

```json
{
  "$schema": "./schemas/mcp-check.config.schema.json",
  "target": {
    "type": "stdio",
    "command": "node",
    "args": ["dist/server.js"],
    "env": { "DEBUG": "mcp:*" },
    "cwd": "./examples/servers/basic"
  },
  "expectations": {
    "minProtocolVersion": "1.0.0",
    "capabilities": ["tools", "resources"],
    "tools": [
      {
        "name": "searchDocs",
        "required": true,
        "inputSchemaRef": "#/definitions/SearchQuery",
        "outputSchemaRef": "#/definitions/SearchResult"
      }
    ]
  },
  "suites": [
    "handshake",
    "tool-discovery",
    "tool-invocation",
    "streaming",
    "cancellation",
    "timeouts",
    "large-payloads"
  ],
  "timeouts": {
    "connectMs": 5000,
    "invokeMs": 15000,
    "shutdownMs": 3000
  },
  "chaos": {
    "enable": true,
    "streamChunkJitterMs": [0, 100],
    "injectAbortProbability": 0.05,
    "networkLatencyMs": [0, 50]
  },
  "reporting": {
    "formats": ["html", "json", "junit"],
    "outputDir": "./reports",
    "includeFixtures": true
  }
}
```

2. **Run the tests**:

```bash
# Run all configured test suites
npx mcp-check

# Run specific suites only
npx mcp-check --suites handshake,streaming

# Generate only JUnit XML for CI
npx mcp-check --format junit --output ./reports/junit.xml

# Enable strict mode (fail on unexpected capabilities)
npx mcp-check --strict
```

3. **View results**:
   - **HTML Report**: `./reports/index.html` - Interactive dashboard with test details
   - **JSON Report**: `./reports/results.json` - Machine-readable results
   - **JUnit XML**: `./reports/junit.xml` - CI/CD integration format

## Configuration Schema

The configuration is defined through TypeScript interfaces that provide strong typing and validation:

### Target Configuration

```typescript
export type Target =
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      shell?: boolean;
    }
  | {
      type: 'tcp';
      host: string;
      port: number;
      tls?: boolean;
      timeout?: number;
    }
  | {
      type: 'websocket';
      url: string;
      headers?: Record<string, string>;
      protocols?: string[];
    };
```

### Test Expectations

```typescript
export interface ToolExpectation {
  name: string;
  required?: boolean;
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  description?: string;
  tags?: string[];
}

export interface ResourceExpectation {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface Expectations {
  minProtocolVersion?: string;
  maxProtocolVersion?: string;
  capabilities?: string[];
  tools?: ToolExpectation[];
  resources?: ResourceExpectation[];
  customCapabilities?: Record<string, any>;
}
```

### Chaos and Reliability Testing

```typescript
export interface ChaosConfig {
  enable?: boolean;
  seed?: number; // For reproducible chaos
  networkJitter?: {
    delayMs?: [number, number];
    dropProbability?: number;
    duplicateProbability?: number;
  };
  streamChaos?: {
    chunkJitterMs?: [number, number];
    reorderProbability?: number;
    duplicateChunkProbability?: number;
  };
  protocolChaos?: {
    injectAbortProbability?: number;
    malformedJsonProbability?: number;
    unexpectedMessageProbability?: number;
  };
}
```

### Reporting Configuration

```typescript
export interface ReportingConfig {
  formats?: ('html' | 'json' | 'junit' | 'badge')[];
  outputDir?: string;
  includeFixtures?: boolean;
  redaction?: {
    enabled?: boolean;
    allowedFields?: string[];
    patterns?: string[];
  };
  telemetry?: {
    opentelemetry?: {
      enabled?: boolean;
      endpoint?: string;
      serviceName?: string;
    };
    sentry?: {
      enabled?: boolean;
      dsn?: string;
      environment?: string;
    };
  };
}
```

### Complete Configuration Interface

```typescript
export interface CheckConfig {
  $schema?: string;
  target: Target;
  expectations?: Expectations;
  suites?: string[] | 'all';
  timeouts?: {
    connectMs?: number;
    invokeMs?: number;
    shutdownMs?: number;
    streamMs?: number;
  };
  chaos?: ChaosConfig;
  reporting?: ReportingConfig;
  parallelism?: {
    maxConcurrentTests?: number;
    maxConcurrentConnections?: number;
  };
}
```

## Test Suite Matrix

### Core Protocol Suites

#### `handshake`

**Purpose**: Validates the initial MCP protocol handshake and capability negotiation.

**Test Cases**:

- **Connection establishment**: Server responds within `connectMs` timeout
- **Protocol version**: Server announces version ≥ `minProtocolVersion`
- **Capability negotiation**: Server capabilities match `expectations.capabilities`
- **Feature detection**: Optional capabilities are properly advertised
- **Error handling**: Graceful handling of unsupported protocol versions

**Success Criteria**: All handshake steps complete successfully and capabilities align with expectations.

#### `tool-discovery`

**Purpose**: Validates tool enumeration and schema definition compliance.

**Test Cases**:

- **Tool enumeration**: All tools are listed with unique names
- **Schema validation**: Each tool provides valid JSON Schema for inputs/outputs
- **Reference resolution**: All `$ref` pointers resolve correctly (local/remote)
- **Required tools**: All tools marked as `required: true` in expectations are present
- **Schema compliance**: Tools schemas follow JSON Schema Draft 7+ specification

**Success Criteria**: All expected tools are discovered with valid, resolvable schemas.

#### `tool-invocation`

**Purpose**: Tests tool execution under normal and edge case conditions.

**Test Cases**:

- **Happy path**: Valid inputs produce schema-compliant outputs
- **Input validation**: Invalid inputs are rejected with appropriate errors
- **Deterministic behavior**: Repeated calls with same input produce consistent results
- **Error propagation**: Tool errors are properly formatted and transmitted
- **Timeout handling**: Long-running tools respect `invokeMs` timeout

**Success Criteria**: Tools behave predictably and handle both valid and invalid inputs correctly.

#### `streaming`

**Purpose**: Validates streaming response handling and ordering guarantees.

**Test Cases**:

- **Message ordering**: `start → delta* → end` sequence is preserved
- **Backpressure handling**: Server respects client flow control
- **Chunk integrity**: Data chunks arrive uncorrupted despite network jitter
- **Partial responses**: Incomplete streams are clearly marked
- **Resource cleanup**: Streaming resources are properly released

**Success Criteria**: Streaming maintains data integrity and proper message ordering under all conditions.

#### `cancellation`

**Purpose**: Tests client-initiated cancellation and cleanup behavior.

**Test Cases**:

- **Cancellation acknowledgment**: Server acknowledges cancellation within timeout
- **Resource cleanup**: Server stops processing and releases resources
- **Partial results**: Clearly marked partial outputs when cancellation occurs mid-stream
- **Graceful termination**: No protocol violations during cancellation
- **Multiple cancellations**: Handling of duplicate or rapid cancellation requests

**Success Criteria**: Cancellations are handled gracefully with proper cleanup and clear status.

#### `timeouts`

**Purpose**: Validates timeout handling across different operation types.

**Test Cases**:

- **Connection timeouts**: Initial connection attempts respect `connectMs`
- **Invocation timeouts**: Tool calls exceeding `invokeMs` return timeout errors
- **Streaming timeouts**: Stream operations respect `streamMs` limits
- **Shutdown timeouts**: Graceful shutdown within `shutdownMs`

**Success Criteria**: All timeout scenarios produce appropriate error responses without protocol breakage.

#### `large-payloads`

**Purpose**: Tests protocol behavior with large data transfers.

**Test Cases**:

- **Large inputs**: Inputs >10MB are handled without protocol framing issues
- **Large outputs**: Outputs >10MB stream correctly with proper chunking
- **Memory efficiency**: Large payloads don't cause excessive memory usage
- **Compression support**: Optional compression is used when available
- **Progress indication**: Large transfers provide progress feedback

**Success Criteria**: Large payloads are transferred efficiently without breaking protocol semantics.

### Chaos Engineering Suites

#### `chaos-network`

**Purpose**: Tests resilience under adverse network conditions.

**Chaos Scenarios**:

- **Latency injection**: Random delays between 0-100ms
- **Packet loss**: 1-5% packet drop simulation
- **Connection drops**: Random connection termination and recovery
- **Bandwidth throttling**: Simulated low-bandwidth conditions

#### `chaos-protocol`

**Purpose**: Tests protocol parser robustness.

**Chaos Scenarios**:

- **Malformed JSON**: Invalid JSON injection at low probability
- **Out-of-order messages**: Message ID manipulation
- **Unexpected message types**: Protocol violation injection
- **Field manipulation**: Random field omission/addition within schema bounds

#### `chaos-timing`

**Purpose**: Tests temporal edge cases and race conditions.

**Chaos Scenarios**:

- **Clock skew**: Simulated time differences between client/server
- **Rapid requests**: High-frequency tool invocations
- **Concurrent operations**: Multiple simultaneous tool executions
- **Delayed responses**: Artificially delayed server responses

### Performance Suites

#### `performance-baseline`

**Purpose**: Establishes performance baselines for regression detection.

**Metrics**:

- **Connection time**: Time to establish connection and complete handshake
- **Tool latency**: Response time for simple tool invocations
- **Throughput**: Messages per second under load
- **Memory usage**: Peak memory consumption during test execution

#### `performance-stress`

**Purpose**: Tests behavior under high load conditions.

**Scenarios**:

- **Concurrent connections**: Multiple simultaneous client connections
- **High message volume**: Sustained high-frequency message exchange
- **Large concurrent streams**: Multiple large data transfers
- **Resource exhaustion**: Testing behavior near system limits

### Security Suites

#### `security-input-validation`

**Purpose**: Tests input sanitization and validation.

**Test Cases**:

- **Injection attacks**: SQL, JSON, and command injection attempts
- **Buffer overflows**: Extremely large input values
- **Unicode handling**: Complex Unicode and encoding edge cases
- **Schema bypass**: Attempts to bypass JSON schema validation

#### `security-transport`

**Purpose**: Validates transport security measures.

**Test Cases**:

- **TLS validation**: Proper certificate validation (for TCP/WebSocket)
- **Authentication**: Proper handling of authentication headers
- **Authorization**: Access control for restricted tools/resources
- **Data sanitization**: PII and sensitive data redaction

## Reporting and Output Formats

### JSON Report (`reports/results.json`)

Machine-readable format for CI/CD integration and automated analysis:

```json
{
  "version": "1.0.0",
  "metadata": {
    "mcpCheckVersion": "2.1.0",
    "startedAt": "2025-08-08T14:21:05.123Z",
    "completedAt": "2025-08-08T14:25:17.435Z",
    "durationMs": 4312,
    "environment": {
      "platform": "darwin",
      "nodeVersion": "20.11.0",
      "architecture": "arm64"
    }
  },
  "target": {
    "type": "stdio",
    "command": "node",
    "args": ["dist/server.js"],
    "resolved": {
      "workingDirectory": "/path/to/server",
      "executable": "/usr/local/bin/node"
    }
  },
  "configuration": {
    "suites": ["handshake", "tool-discovery", "streaming"],
    "chaosEnabled": true,
    "timeouts": { "connectMs": 5000, "invokeMs": 15000 }
  },
  "results": {
    "summary": {
      "total": 25,
      "passed": 23,
      "failed": 2,
      "skipped": 0,
      "warnings": 1
    },
    "suites": [
      {
        "name": "handshake",
        "status": "passed",
        "durationMs": 234,
        "cases": [
          {
            "name": "protocol-version-negotiation",
            "status": "passed",
            "durationMs": 45,
            "details": {
              "serverVersion": "1.0.0",
              "clientVersion": "1.0.0",
              "negotiatedVersion": "1.0.0"
            }
          }
        ]
      },
      {
        "name": "streaming",
        "status": "failed",
        "durationMs": 1203,
        "cases": [
          {
            "name": "delta-ordering-under-jitter",
            "status": "failed",
            "durationMs": 856,
            "error": {
              "type": "OutOfOrderDeltaError",
              "message": "Delta sequence numbers out of order: expected 3, got 5",
              "details": {
                "expectedSequence": 3,
                "actualSequence": 5,
                "deltaCount": 12
              },
              "fixture": "fixtures/streaming/out-of-order-delta-123.json"
            }
          }
        ]
      }
    ],
    "fixtures": [
      {
        "id": "streaming-001",
        "description": "Out of order delta sequence",
        "path": "fixtures/streaming/out-of-order-delta-123.json",
        "reproducible": true
      }
    ]
  }
}
```

### HTML Report (`reports/index.html`)

Interactive dashboard featuring:

- **Executive Summary**: Pass/fail overview with visual indicators
- **Suite Breakdown**: Expandable sections for each test suite
- **Error Details**: Detailed failure analysis with stack traces
- **Fixture Links**: Direct links to reproducible test scenarios
- **Performance Metrics**: Response times and throughput charts
- **Comparison Views**: Side-by-side diff views for failures

### JUnit XML (`reports/junit.xml`)

Standard format for CI/CD pipeline integration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="mcp-check" tests="25" failures="2" errors="0" time="4.312">
  <testsuite name="handshake" tests="5" failures="0" errors="0" time="0.234">
    <testcase name="protocol-version-negotiation" classname="handshake" time="0.045"/>
    <!-- ... more test cases ... -->
  </testsuite>
  <testsuite name="streaming" tests="8" failures="1" errors="0" time="1.203">
    <testcase name="delta-ordering-under-jitter" classname="streaming" time="0.856">
      <failure message="Delta sequence numbers out of order">
        Expected sequence: 3, Actual: 5
        Fixture available at: fixtures/streaming/out-of-order-delta-123.json
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

### Badge Generation (`reports/badge.json`)

Shields.io compatible badge data:

```json
{
  "schemaVersion": 1,
  "label": "mcp-check",
  "message": "23/25 passed",
  "color": "yellow",
  "cacheSeconds": 300,
  "style": "flat-square"
}
```

### Test Fixtures

Reproducible test scenarios are automatically generated for failures:

```json
{
  "id": "streaming-delta-ordering-001",
  "description": "Out of order delta sequence reproduction",
  "timestamp": "2025-08-08T14:23:42.567Z",
  "chaosConfig": {
    "seed": 12345,
    "streamChunkJitterMs": [10, 50],
    "networkLatencyMs": [5, 25]
  },
  "target": {
    "type": "stdio",
    "command": "node",
    "args": ["dist/server.js"]
  },
  "scenario": {
    "toolName": "streamData",
    "input": { "size": 1024, "chunks": 20 },
    "expectedBehavior": "Sequential delta ordering",
    "actualBehavior": "Delta 5 received before delta 3"
  },
  "reproduction": {
    "command": "npx mcp-check --fixture fixtures/streaming-delta-ordering-001.json",
    "environment": {
      "CHAOS_SEED": "12345",
      "DEBUG": "mcp:streaming"
    }
  }
}
```

## Command Line Interface

### Basic Commands

```bash
# Run all configured test suites
mcp-check

# Specify custom config file
mcp-check --config ./custom-config.json

# Run specific test suites
mcp-check --suites handshake,streaming,cancellation

# Generate specific report formats
mcp-check --format json,html --output-dir ./custom-reports

# Enable strict mode (fail on unexpected capabilities/tools)
mcp-check --strict

# Set chaos testing seed for reproducible results
mcp-check --chaos-seed 12345

# Increase verbosity for debugging
mcp-check --verbose --debug mcp:*
```

### Advanced Usage

```bash
# Run only chaos/fuzz tests
mcp-check --suites chaos-network,chaos-protocol,chaos-timing

# Override configuration values
mcp-check --timeout.connect 10000 --timeout.invoke 30000

# Run performance benchmarks
mcp-check --suites performance-baseline,performance-stress

# Generate fixtures for specific scenarios
mcp-check --generate-fixtures --suites streaming

# Replay a specific fixture
mcp-check --fixture ./fixtures/streaming-delta-ordering-001.json

# Parallel execution (experimental)
mcp-check --parallel --max-concurrent 4

# Filter tests by tags
mcp-check --tags core,reliability --exclude-tags experimental
```

### CI/CD Integration Commands

```bash
# Minimal output for CI pipelines
mcp-check --quiet --format junit --output ./reports/junit.xml

# Generate badge data for README
mcp-check --badge --output-dir ./badges

# Fail fast on first error (useful for quick feedback)
mcp-check --fail-fast

# Export test results for external analysis
mcp-check --export-data --format json --include-telemetry
```

### Environment Variables

```bash
# Configuration via environment variables
export MCP_CHECK_CONFIG="./config/production.json"
export MCP_CHECK_TIMEOUT_CONNECT="10000"
export MCP_CHECK_CHAOS_SEED="12345"
export MCP_CHECK_OUTPUT_DIR="./reports"
export DEBUG="mcp:*"  # Enable debug logging

mcp-check  # Uses environment configuration
```

### Exit Codes

- `0`: All tests passed successfully
- `1`: One or more tests failed
- `2`: Configuration error or invalid arguments
- `3`: Target server/client could not be reached
- `4`: Internal tool error or unexpected exception

## GitHub Action Integration

### Basic Workflow

Create `.github/workflows/mcp-conformance.yml`:

```yaml
name: MCP Conformance Testing
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  mcp-conformance:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build MCP server
        run: npm run build

      - name: Run MCP conformance tests
        uses: mcereal/mcp-check-action@v1
        with:
          config-path: './mcp-check.config.json'
          suites: 'handshake,tool-discovery,tool-invocation,streaming'
          strict-mode: true
          upload-reports: true

      - name: Upload test reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: mcp-reports-node-${{ matrix.node-version }}
          path: reports/
          retention-days: 30

      - name: Comment PR with results
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('./reports/results.json', 'utf8'));
            const { summary } = results.results;

            const message = `## MCP Conformance Test Results

            **Node.js ${{ matrix.node-version }}:**
            - ✅ Passed: ${summary.passed}
            - ❌ Failed: ${summary.failed}
            - ⏭️ Skipped: ${summary.skipped}

            ${summary.failed > 0 ? '⚠️ Some tests failed. Please check the detailed report.' : '🎉 All tests passed!'}

            [View detailed report](${context.payload.pull_request.html_url}/files)`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: message
            });
```

### Advanced Workflow with Multiple Targets

```yaml
name: MCP Multi-Target Testing
on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC
  workflow_dispatch:

jobs:
  test-matrix:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        target-type: [stdio, tcp, websocket]
        include:
          - target-type: stdio
            config: 'configs/stdio.json'
          - target-type: tcp
            config: 'configs/tcp.json'
          - target-type: websocket
            config: 'configs/websocket.json'

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run build

      - name: Start background services
        if: matrix.target-type != 'stdio'
        run: |
          if [ "${{ matrix.target-type }}" = "tcp" ]; then
            npm run start:tcp-server &
            echo "TCP_SERVER_PID=$!" >> $GITHUB_ENV
          elif [ "${{ matrix.target-type }}" = "websocket" ]; then
            npm run start:ws-server &
            echo "WS_SERVER_PID=$!" >> $GITHUB_ENV
          fi
          sleep 5  # Allow server to start

      - name: Run MCP tests
        uses: mcereal/mcp-check-action@v1
        with:
          config-path: ${{ matrix.config }}
          chaos-enabled: true
          performance-tests: true
          generate-fixtures: true

      - name: Cleanup background services
        if: always() && matrix.target-type != 'stdio'
        run: |
          if [ -n "$TCP_SERVER_PID" ]; then kill $TCP_SERVER_PID || true; fi
          if [ -n "$WS_SERVER_PID" ]; then kill $WS_SERVER_PID || true; fi

      - name: Upload comprehensive reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: reports-${{ matrix.os }}-${{ matrix.target-type }}
          path: |
            reports/
            fixtures/
            telemetry/
```

### Action Configuration Options

```yaml
- name: MCP Check
  uses: mcereal/mcp-check-action@v1
  with:
    # Configuration file path (required)
    config-path: './mcp-check.config.json'

    # Test suite selection (optional)
    suites: 'handshake,streaming,chaos-network'

    # Reporting options
    report-formats: 'html,json,junit'
    output-directory: './test-reports'
    upload-reports: true

    # Testing modes
    strict-mode: true
    chaos-enabled: true
    performance-tests: false

    # Timeouts (in milliseconds)
    connection-timeout: 10000
    invocation-timeout: 30000

    # Chaos configuration
    chaos-seed: 12345
    chaos-intensity: 0.1

    # Security and compliance
    redact-sensitive-data: true
    include-telemetry: false

    # Debugging
    verbose-logging: false
    debug-patterns: 'mcp:*'
```

## Architecture and Implementation

### Core Components

```
mcp-check/
├── src/
│   ├── core/
│   │   ├── checker.ts           # Main orchestration engine
│   │   ├── transport/           # Transport layer abstractions
│   │   │   ├── stdio.ts
│   │   │   ├── tcp.ts
│   │   │   └── websocket.ts
│   │   └── protocol/            # MCP protocol implementation
│   │       ├── handshake.ts
│   │       ├── messages.ts
│   │       └── streaming.ts
│   ├── suites/                  # Test suite implementations
│   │   ├── handshake/
│   │   ├── tool-discovery/
│   │   ├── streaming/
│   │   ├── chaos/
│   │   └── performance/
│   ├── chaos/                   # Chaos engineering framework
│   │   ├── network-chaos.ts
│   │   ├── protocol-chaos.ts
│   │   └── timing-chaos.ts
│   ├── reporting/               # Report generation
│   │   ├── json-reporter.ts
│   │   ├── html-reporter.ts
│   │   ├── junit-reporter.ts
│   │   └── badge-reporter.ts
│   ├── fixtures/                # Test fixture management
│   │   ├── generator.ts
│   │   └── replay.ts
│   └── cli/                     # Command line interface
│       ├── commands/
│       └── index.ts
├── schemas/                     # JSON Schema definitions
├── templates/                   # Report templates
└── docs/                        # Documentation
```

### Design Principles

1. **Modularity**: Each test suite is self-contained and can run independently
2. **Extensibility**: New test suites and chaos scenarios can be easily added
3. **Reproducibility**: All test runs can be reproduced with fixtures and seeds
4. **Performance**: Efficient resource usage for CI/CD environments
5. **Observability**: Comprehensive logging and telemetry without PII exposure

### Plugin Architecture

```typescript
interface TestSuitePlugin {
  name: string;
  version: string;
  description: string;
  execute(context: TestContext): Promise<TestResult>;
  validate(config: Partial<CheckConfig>): ValidationResult;
}

interface ChaosPlugin {
  name: string;
  description: string;
  inject(context: ChaosContext): Promise<void>;
  restore(context: ChaosContext): Promise<void>;
}
```

## Development Roadmap

### Phase 1: MVP (Months 1-2)

- [ ] Core test suites (handshake, tool-discovery, tool-invocation, streaming)
- [ ] Basic chaos testing (network jitter, timeouts)
- [ ] JSON and HTML reporting
- [ ] CLI interface with essential options
- [ ] GitHub Action (basic version)

### Phase 2: Enhanced Testing (Months 3-4)

- [ ] Advanced chaos scenarios (protocol violations, race conditions)
- [ ] Performance and stress testing suites
- [ ] JUnit XML and badge generation
- [ ] Test fixture generation and replay
- [ ] Security validation suites

### Phase 3: Enterprise Features (Months 5-6)

- [ ] OpenTelemetry and Sentry integration
- [ ] Advanced reporting with comparisons and trends
- [ ] Plugin architecture for custom test suites
- [ ] Distributed testing across multiple environments
- [ ] Compliance reporting for enterprise requirements

### Phase 4: Ecosystem Integration (Months 7+)

- [ ] IDE integration (VS Code extension)
- [ ] Integration with popular CI/CD platforms
- [ ] MCP Inspector integration for visual debugging
- [ ] Community test suite marketplace
- [ ] Advanced analytics and insights dashboard

## Best Practices and Recommendations

### For MCP Server Developers

1. **Start Early**: Integrate mcp-check into your development workflow from day one
2. **Test All Transports**: Validate your server across stdio, TCP, and WebSocket transports
3. **Handle Edge Cases**: Use chaos testing to discover and fix edge case handling
4. **Monitor Performance**: Use performance suites to prevent regressions
5. **Validate Schemas**: Ensure tool schemas are comprehensive and accurate

### For CI/CD Integration

1. **Fail Fast**: Use `--fail-fast` in development branches for quick feedback
2. **Comprehensive Testing**: Run full test suites on release branches
3. **Artifact Preservation**: Always upload test reports and fixtures
4. **Matrix Testing**: Test across multiple Node.js versions and operating systems
5. **Performance Tracking**: Monitor performance metrics over time

### Security Considerations

1. **Data Redaction**: Always enable PII redaction in CI environments
2. **Secret Management**: Use secure secret management for any credentials
3. **Fixture Sanitization**: Ensure test fixtures don't contain sensitive data
4. **Telemetry Privacy**: Review telemetry data before enabling in production
5. **Access Control**: Restrict access to detailed reports in public repositories

## Contributing and Community

### Getting Started

1. Fork the repository and create a feature branch
2. Install dependencies: `npm install`
3. Run existing tests: `npm test`
4. Add your changes with appropriate tests
5. Submit a pull request with a clear description

### Adding New Test Suites

1. Create a new directory under `src/suites/`
2. Implement the `TestSuitePlugin` interface
3. Add configuration schema definitions
4. Include comprehensive test cases
5. Update documentation and examples

### Reporting Issues

When reporting issues, please include:

- mcp-check version and configuration
- Target server/client details
- Complete error messages and stack traces
- Minimal reproduction case
- Environment information (OS, Node.js version)

---

## License

Apache-2.0 - See [LICENSE](LICENSE) file for details.
