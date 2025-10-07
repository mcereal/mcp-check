# MCP Check Roadmap

Last updated: 2025-10-07.

## Completed Milestones

### Foundation (v0.1.0)
- Core CLI with `test`, `init`, `validate`, and `list-suites` commands wired to the compiled TypeScript bundle.
- Configuration loader, schema validation, and resolver with stdio/TCP/WebSocket transport definitions.
- Baseline conformance suites: handshake, tool discovery, tool invocation, and streaming (including concurrency and long-running scenarios).
- Transport factory with pluggable adapters and automatic fallback to custom transports when the SDK cannot connect directly.
- Deterministic chaos controller factory, presets, and plugin hooks exposed across the CLI and configuration file.
- Reporting pipeline with JSON, HTML, JUnit, and badge reporters plus fixture capture and telemetry manager stubs.
- File-based fixture manager for reproducible scenarios and archival/cleanup utilities.
- Jest test harness bootstrapped for unit, integration, and end-to-end coverage.
- Initial documentation on chaos engineering and reporting.

## In Progress

### Resilience & Coverage (next minor)
- Flesh out telemetry providers (OpenTelemetry, Sentry) with configuration examples, CI smoke tests, and opt-in redaction policies.
- Expand fixture tooling: CLI subcommands for listing/exporting fixtures and linking fixtures into HTML reports.
- Harden chaos presets and surface them as named intensity profiles in both config schema and CLI help output.
- Align `suites: "all"` resolver output with actual registered suites and add guard rails when optional suites are missing.
- Build richer example MCP targets (stdio and WebSocket) that exercise streaming, resources, and chaos scenarios.
- Author configuration reference documentation (schema walkthrough, advanced overrides, and troubleshooting).

## Planned / Backlog

### Coverage Expansion
- New conformance suites: cancellation, timeout behaviour, large payload handling, security input validation, and performance baselines referenced in configuration defaults.
- Negative-path suites targeting chaos-specific behaviours (`chaos-network`, `chaos-protocol`, `chaos-timing`).
- Resource-specific suite validating list/fetch semantics, MIME handling, and partial responses.

### Reporting & Observability
- Trend analysis and historical comparison mode for HTML reports.
- First-class GitHub Action with artifact publishing and shields.io badge automation.
- Pluggable notification channel for surfacing failures (Slack/webhook).

### Developer Experience
- Improve configuration resolver to read version metadata from `package.json` and embed it in reports.
- Interactive `mcp-check init` wizard to scaffold targets, expectations, and suite selection.
- Typed configuration SDK for programmatic test orchestration.
- Package distribution to npm under the `@mcereal` scope with pre-built binaries.

## How to Contribute

Have ideas or want to help move an item forward? Open an issue describing your use case or reach out via discussions. Pull requests targeting “In Progress” items are prioritized, but ambitious contributions from the backlog are welcome—coordinate early so we can line up design and review support.
