# MCP Check Roadmap

Last updated: 2026-03-27.

## Completed

### Foundation (v1.0.0)
- Core CLI with `test`, `init`, `validate`, `list-suites`, and `fixtures` commands.
- Configuration loader, schema validation, and resolver with stdio/TCP/WebSocket transport definitions.
- Conformance suites: handshake, tool discovery, tool invocation, streaming, timeout, and large payload.
- Transport factory with pluggable adapters and automatic fallback to custom transports.
- Deterministic chaos controller factory with 4 plugins (network, protocol, stream, timing).
- Reporting pipeline with JSON, HTML, JUnit, and badge reporters plus fixture capture.
- File-based fixture manager for reproducible scenarios and archival/cleanup utilities.
- Jest test harness with unit, integration, and end-to-end coverage.
- Documentation: chaos engineering, reporting, GitHub Action, and roadmap guides.
- Published to npm as `@mcereal/mcp-check`.

### Enterprise Hardening (v1.0.7 - v1.0.10)
- `readOnly` tool annotation to skip invocation tests on mutating tools.
- `deterministic` tool annotation to skip double-call tests on live-data tools.
- Chaos wired into actual MCP communication via `ChaosSDKTransport` (wraps SDK transport layer).
- Parallel suite execution with `--parallel` and `--max-concurrent` flags.
- Fixture auto-capture on test failures (connection, invocation, timeout, validation).
- Resource discovery test in tool-discovery suite.
- Error categories on all test errors (`connection`, `protocol`, `timeout`, `validation`, `runtime`, `resource`).
- Improved CLI summary: per-suite breakdown, skip reasons, slowest tests, parallel indicator.
- Success rate calculation excludes skipped tests.
- `init` command refuses to overwrite existing config files.
- CLI defaults no longer override config file values.
- Fixed JUnit reporter and outputDir not respecting config.
- Defensive guards in all reporters for redaction edge cases.
- GitHub Action (`action/action.yml`) with configurable inputs.

## In Progress

### Resilience & Coverage
- Flesh out telemetry providers (OpenTelemetry, Sentry) with configuration examples.
- Build richer example MCP targets (stdio and WebSocket) that exercise streaming, resources, and chaos scenarios.
- Restore sandbox-friendly integration coverage for the CLI.

## Planned / Backlog

### Coverage Expansion
- Cancellation suite for in-flight request cancellation.
- Security input validation suite.
- Performance baseline and stress testing suites.
- Negative-path suites targeting chaos-specific behaviours.
- Resource-specific suite validating MIME handling and partial responses.

### Reporting & Observability
- Trend analysis and historical comparison mode for HTML reports.
- Pluggable notification channel for surfacing failures (Slack/webhook).

### Developer Experience
- Interactive `mcp-check init` wizard improvements.
- Typed configuration SDK for programmatic test orchestration.

## How to Contribute

Have ideas or want to help move an item forward? Open an issue describing your use case or reach out via discussions. Pull requests targeting "In Progress" items are prioritized.
