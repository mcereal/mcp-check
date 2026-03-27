# MCP Check

Conformance testing, chaos engineering, and reporting for [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers.

MCP Check validates that your MCP server behaves the way AI agents expect: correct handshakes, proper tool schemas, resilient error handling, and graceful behavior under failure conditions.

## Features

- **6 built-in test suites** covering handshake, tool discovery, tool invocation, streaming, timeouts, and large payloads
- **Chaos engineering** with 4 fault injection plugins (network, protocol, stream, timing) and seeded reproducibility
- **4 report formats** (HTML, JSON, JUnit XML, shields.io badge) with fixture capture for failure reproduction
- **Parallel execution** for faster test runs with configurable concurrency
- **Safe by default** with `readOnly` and `deterministic` tool annotations to prevent side effects during testing

## Requirements

- Node.js >= 22.0.0
- npm >= 10.0.0

## Quick Start

```bash
# Install
npm install -D @mcereal/mcp-check

# Create a config file
npx mcp-check init

# Run tests
npx mcp-check test --config mcp-check.config.json
```

## Configuration

Create `mcp-check.config.json` in your project root:

```json
{
  "$schema": "node_modules/@mcereal/mcp-check/schemas/mcp-check.config.schema.json",
  "target": {
    "type": "stdio",
    "command": "node",
    "args": ["dist/server.js"],
    "cwd": "."
  },
  "expectations": {
    "capabilities": ["tools", "resources"],
    "tools": [
      { "name": "my-tool", "required": true, "description": "My tool" },
      { "name": "dangerous-tool", "required": true, "readOnly": false },
      { "name": "live-data-tool", "required": true, "deterministic": false }
    ],
    "resources": [
      { "uri": "file://docs/", "name": "Documentation" }
    ]
  },
  "suites": "all",
  "timeouts": {
    "connectMs": 5000,
    "invokeMs": 15000,
    "shutdownMs": 3000,
    "streamMs": 30000
  },
  "chaos": {
    "enable": false,
    "seed": 42,
    "intensity": 0.1,
    "network": {
      "delayMs": [0, 100],
      "dropProbability": 0.01,
      "duplicateProbability": 0.005
    },
    "protocol": {
      "injectAbortProbability": 0.005,
      "malformedJsonProbability": 0.001
    },
    "timing": {
      "clockSkewMs": [-1000, 1000],
      "processingDelayMs": [0, 100]
    }
  },
  "reporting": {
    "formats": ["html", "json", "junit"],
    "outputDir": "./reports",
    "includeFixtures": true
  },
  "parallelism": {
    "maxConcurrentTests": 6,
    "maxConcurrentConnections": 6
  }
}
```

### Transport Types

| Type | Config | Description |
|------|--------|-------------|
| `stdio` | `command`, `args`, `env`, `cwd` | Spawns server as child process (recommended) |
| `tcp` | `host`, `port`, `tls` | TCP socket connection |
| `websocket` | `url`, `headers`, `protocols` | WebSocket connection |

### Tool Expectations

Mark tools to control test behavior:

- **`readOnly: false`** — Tool has side effects (creates, updates, deletes data). Invocation tests are skipped to prevent unintended changes during testing.
- **`deterministic: false`** — Tool returns different results on repeated calls (live data, timestamps, etc.). Deterministic behavior tests are skipped.

Both default to `true` (safe to invoke, expected to be deterministic).

## CLI Reference

### Commands

```bash
mcp-check test [options]       # Run conformance tests
mcp-check init [options]       # Create configuration file
mcp-check validate [options]   # Validate configuration file
mcp-check list-suites          # List available test suites
mcp-check fixtures <command>   # Manage test fixtures
```

### Test Options

```
-c, --config <path>        Configuration file path
-s, --suites <suites>      Comma-separated suites (e.g., handshake,tool-invocation)
-f, --format <formats>     Output formats (json,html,junit,badge)
-o, --output-dir <dir>     Output directory for reports
--parallel                 Run test suites in parallel
--max-concurrent <n>       Max concurrent suites (default: all)
--strict                   Fail on unexpected capabilities
--fail-fast                Stop on first suite failure
--chaos-seed <seed>        Seed for reproducible chaos
--chaos-intensity <level>  low, medium, high, or extreme
--chaos-network            Enable network chaos
--chaos-protocol           Enable protocol chaos
--chaos-timing             Enable timing chaos
--no-chaos                 Disable all chaos
--timeout.connect <ms>     Connection timeout
--timeout.invoke <ms>      Invocation timeout
--verbose                  Verbose logging
--debug <patterns>         Debug patterns (e.g., mcp:*)
```

### Fixture Commands

```bash
mcp-check fixtures list                  # List saved fixtures
mcp-check fixtures show <id>             # Show fixture details
mcp-check fixtures export --output <dir> # Export fixtures
mcp-check fixtures cleanup --max-age 7   # Remove old fixtures (days)
```

## Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| `handshake` | 5 | Protocol initialization, capability negotiation, ping, tool/resource discovery |
| `tool-discovery` | 6 | Tool enumeration, required tools validation, JSON Schema validation, resource discovery |
| `tool-invocation` | 3/tool | Basic invocation, input validation, deterministic behavior (per expected tool) |
| `streaming` | 4 | Rapid requests, long-running operations, concurrent calls, resource streaming |
| `timeout` | 5 | Connection timeout, invocation timeout, concurrent timeouts, recovery, progressive timing |
| `large-payload` | 5 | Large inputs (1KB-100KB), large outputs, complex JSON, memory stability, resource content |

## Parallel Execution

Run suites concurrently for faster results. Each suite spawns its own isolated server process.

```bash
# All suites in parallel
npx mcp-check test --config mcp-check.config.json --parallel

# Cap concurrency
npx mcp-check test --config mcp-check.config.json --parallel --max-concurrent 3
```

Output includes parallel indicator:
```
Total: 155  (96.7% pass rate, 45.2s)  [parallel, max all]
```

## Chaos Engineering

Inject controlled failures to validate server resilience. Chaos is disabled by default.

```bash
# Light chaos for CI
npx mcp-check test --chaos-intensity low --chaos-seed 42

# Aggressive stress testing
npx mcp-check test --chaos-intensity high --chaos-seed 42

# Target specific failure modes
npx mcp-check test --chaos-network --chaos-protocol
```

**Intensity levels:** `low` (5%), `medium` (10%), `high` (30%), `extreme` (50%)

**Plugins:**
- **Network** — delays, packet drops, duplication, reordering, corruption
- **Protocol** — malformed JSON, unexpected messages, schema violations, connection aborts
- **Stream** — chunk jitter, reordering, duplication, message splitting
- **Timing** — clock skew, processing delays, timeout reduction

Seeds ensure reproducible chaos patterns across runs. See [docs/chaos-engineering.md](docs/chaos-engineering.md) for the full configuration reference.

## Reporting

```bash
npx mcp-check test --format html,json,junit,badge --output-dir ./reports
```

| Format | File | Description |
|--------|------|-------------|
| `html` | `index.html` | Interactive report with charts, expandable suites, test details |
| `json` | `results.json` | Machine-readable results with performance analytics |
| `junit` | `junit.xml` | Standard JUnit XML for CI/CD integration |
| `badge` | `badge.json` | shields.io compatible badge data |

## CI Integration

### GitHub Actions

```yaml
- name: Test MCP Server
  uses: mcereal/mcp-check@v1
  with:
    config: mcp-check.config.json
    formats: json,junit
    chaos-enabled: true
    chaos-intensity: low
```

Or run directly:

```yaml
- name: Test MCP Server
  run: npx @mcereal/mcp-check test --config mcp-check.config.json --parallel
```

See [docs/github-action.md](docs/github-action.md) for the full action reference.

## Development

```bash
npm test              # Run unit tests (Jest)
npm run build         # Compile TypeScript
npm run lint          # Lint
npm run format        # Format
```

## Links

- [Chaos Engineering Guide](docs/chaos-engineering.md)
- [Reporting Guide](docs/reporting.md)
- [GitHub Action Reference](docs/github-action.md)
- [Roadmap](docs/roadmap.md)
- [npm Package](https://www.npmjs.com/package/@mcereal/mcp-check)
