# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mcp-check is a TypeScript/Node.js CLI tool and library for conformance and reliability testing of Model Context Protocol (MCP) servers and clients. It validates MCP implementations through test suites covering handshake, tool discovery, tool invocation, and streaming functionality.

## Commands

```bash
# Build
npm run build           # Compile TypeScript to dist/

# Test
npm test                # Run all tests with coverage
npm test:watch          # Watch mode for development

# Lint and Format
npm run lint            # Check for linting issues
npm run lint:fix        # Auto-fix linting issues
npm run format          # Format code with Prettier

# Clean
npm run clean           # Remove dist/ directory

# CLI (after build)
./bin/mcp-check.js test --config <config-file>
./bin/mcp-check.js init
./bin/mcp-check.js validate --config <config-file>
./bin/mcp-check.js list-suites
./bin/mcp-check.js fixtures list
./bin/mcp-check.js fixtures show <id>
./bin/mcp-check.js fixtures export --output <dir>
./bin/mcp-check.js fixtures cleanup --max-age <days>
```

## Architecture

### Plugin-Based Design
The system uses factory patterns for transports and chaos injection, observer patterns for event handling, and configuration-driven execution.

### Core Modules

**Core** (`src/core/`):
- `MCPChecker` - Main orchestration engine that registers test suites, manages transports/chaos, executes tests, and emits lifecycle events
- `config.ts` - JSON schema validation with AJV, configuration resolution
- `mcp-client.ts` - Bridges custom Transport interface with MCP SDK
- `fixture-manager.ts` - File-based test fixture persistence for reproducible testing scenarios

**Transports** (`src/transports/`):
- `BaseTransport` - Abstract base with connection state, message parsing, statistics
- `StdioTransport`, `TcpTransport`, `WebSocketTransport` - Protocol implementations
- `TransportFactory` - Creates transports from config

**Test Suites** (`src/suites/`):
- `HandshakeTestSuite` - Protocol handshake and capability negotiation
- `ToolDiscoveryTestSuite` - Tool listing and schema validation
- `ToolInvocationTestSuite` - Tool execution and error handling
- `StreamingTestSuite` - Concurrent requests and message ordering

**Chaos** (`src/chaos/`):
- `DefaultChaosController` - Manages plugins with deterministic PRNG (seeded)
- Plugins: `NetworkChaos`, `ProtocolChaos`, `TimingChaos`, `StreamChaos`

**Reporting** (`src/reporting/`):
- `ReportManager` - Coordinates multiple reporters
- Reporters: JSON, HTML, JUnit (CI), Badge
- `TelemetryManager` - Optional telemetry with OpenTelemetry and Sentry providers

### Data Flow

1. Config File → ConfigLoader → JSONSchema Validation → ResolvedConfig
2. TransportFactory → Transport Instance
3. MCPChecker.run() → Suite.setup() → Suite.execute(TestContext) → Suite.teardown()
4. Results → ReportManager → Multiple Reporters

### Key Interfaces

All test suites implement `TestSuitePlugin` interface. All transports implement `Transport` interface. Chaos plugins implement `ChaosPlugin` interface.

## Testing

- Framework: Jest with ts-jest
- Tests location: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Test pattern: `*.spec.ts`
- Setup file: `tests/setup.ts`

## Configuration

Example configs in `examples/` directory. JSON schema at `schemas/mcp-check.config.schema.json` provides VS Code IntelliSense.

Target types: `stdio`, `tcp`, `websocket`

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `commander` - CLI framework
- `ajv` - JSON schema validation
- `ws` - WebSocket support
