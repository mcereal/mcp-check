# MCP Check

MCP Check is a conformance and reliability harness for Model Context Protocol (MCP) servers and clients. It bundles transport adapters, canonical test suites, chaos engineering hooks, and rich reporting so tool builders can validate that their MCP implementations behave the way agents expect.

---

## Why MCP Check?

- **Turnkey conformance runs** – ship-ready suites for handshake, tool discovery, tool invocation, and streaming behaviours.
- **Configurable transports** – connect to MCP targets over stdio, TCP sockets, or WebSockets with a single config file.
- **Chaos engineering** – flip on deterministic fault injection to harden servers before users discover the edge cases.
- **Comprehensive reporting** – JSON, HTML, JUnit, and badge outputs plus fixture capture and optional telemetry export.
- **Extensible by design** – plug in custom suites, reporters, transports, or chaos plugins without forking the core.

## Project Status

This repository is pre-release software. APIs may change as we expand coverage and tighten the developer experience. Unit test suites (including CLI and tool invocation) run locally today; broader integration coverage is being re-imagined around mock transports per the [feature roadmap](docs/roadmap.md).

## Getting Started

```bash
git clone https://github.com/mcereal/mcp-check.git
cd mcp-check
npm install
npm run build

# Run the CLI locally
node ./bin/mcp-check.js test --help
```

You can also execute the development build via `npx`:

```bash
npx ts-node src/cli/index.ts test --config examples/basic-stdio.config.json
```

> **Prerequisites:** Node.js 20+ and npm 10+. The CLI depends on the official [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

## Quick Tour

- `src/core` – orchestration layer for configuration loading, result aggregation, and lifecycle events.
- `src/transports` – adapters for stdio, TCP, and WebSocket targets plus a factory used by the CLI.
- `src/suites` – built-in conformance suites covering handshake, tool discovery, tool invocation, and streaming scenarios.
- `src/chaos` – deterministic chaos controller, presets, and plugin hooks for failure injection.
- `src/reporting` – report manager, format-specific emitters, fixture capture, and telemetry integrations.
- `docs/` – deeper guides on [chaos engineering](docs/chaos-engineering.md) and [reporting](docs/reporting.md).
- `examples/` – sample configuration files and workflows (kept in sync as features evolve).

## Running Tests Against Your MCP Target

1. Create an MCP configuration describing how to launch or connect to your server:

   ```jsonc
   {
     "$schema": "./schemas/mcp-check.config.schema.json",
     "target": {
       "type": "stdio",
       "command": "node",
       "args": ["./examples/echo-server.js"]
     },
     "reporting": {
       "formats": ["json", "html", "junit"],
       "outputDir": "./reports"
     }
   }
   ```

2. Run the conformance suite:

   ```bash
   node ./bin/mcp-check.js test --config my-mcp.config.json --verbose
   ```

3. Inspect the generated reports in `./reports` (fixtures are included when enabled).

### Selecting Suites

Pass a comma-separated list to `--suites` to restrict execution, e.g. `--suites handshake,tool-invocation`. Use `node ./bin/mcp-check.js list-suites` to see everything that ships with MCP Check.

### Chaos Engineering

Chaos injection is disabled by default. Enable and tune it via CLI flags or configuration:

```bash
node ./bin/mcp-check.js test \
  --config my-mcp.config.json \
  --chaos-intensity medium \
  --chaos-network \
  --chaos-protocol
```

Refer to [docs/chaos-engineering.md](docs/chaos-engineering.md) for the complete option matrix and plugin API.

### Reporting

The report manager can emit `json`, `html`, `junit`, and `badge` formats in parallel and optionally produce fixtures or telemetry. Learn more in [docs/reporting.md](docs/reporting.md).

## Configuration Reference

- Generate a baseline file with `node ./bin/mcp-check.js init`.
- Validate changes before running tests using `node ./bin/mcp-check.js validate --config my-mcp.config.json`.
- Schemas live in `schemas/` to support editor IntelliSense and automation.

## Local Development

- Run unit tests: `npm test` (Jest).
- Lint and format: `npm run lint` / `npm run lint:fix` / `npm run format`.
- Build TypeScript outputs: `npm run build`.

Key directories to explore:

- `tests/` – Jest suites covering transports, reporting pipelines, and suite behaviours.
- `examples/` – canonical MCP targets and configs for manual or CI validation.
- `bin/` – packaged CLI shim targeting the compiled TypeScript output in `dist/`.

## Contributing

We welcome experimentation while the project is in flux. Please review [CONTRIBUTING.md](CONTRIBUTING.md) and open an issue or PR to discuss new suites, transport adapters, or integrations.

## Roadmap & Support

- Track feature progress and upcoming work in [docs/roadmap.md](docs/roadmap.md).
- Security concerns? Follow our [Security Policy](SECURITY.md).
- Funding and sponsorship opportunities are listed in `package.json`.

If you are building MCP tooling and want something that is not yet covered, open an issue describing your use case—we’re iterating actively and feedback helps prioritize the next wave of work.
