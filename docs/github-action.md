# MCP Check GitHub Action

Run MCP conformance tests as part of your CI/CD pipeline.

## Quick Start

Add this workflow to your repository at `.github/workflows/mcp-check.yml`:

```yaml
name: MCP Conformance Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  mcp-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start MCP Server
        run: |
          # Start your MCP server in the background
          npm start &
          sleep 5  # Wait for server to be ready

      - name: Run MCP Check
        uses: mcereal/mcp-check/action@v1
        with:
          config: './mcp-check.config.json'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `config` | Path to mcp-check configuration file | No | `mcp-check.config.json` |
| `suites` | Comma-separated list of test suites | No | All suites |
| `output-dir` | Directory for test reports | No | `./mcp-check-reports` |
| `formats` | Output formats (json,html,junit,badge) | No | `json,junit` |
| `chaos-enabled` | Enable chaos engineering tests | No | `false` |
| `chaos-intensity` | Chaos level (low, medium, high, extreme) | No | `low` |
| `fail-on-warning` | Fail if there are warnings | No | `false` |
| `node-version` | Node.js version to use | No | `22` |

## Outputs

| Output | Description |
|--------|-------------|
| `passed` | Number of tests passed |
| `failed` | Number of tests failed |
| `total` | Total number of tests |
| `success` | Whether all tests passed (`true`/`false`) |
| `report-path` | Path to the JSON report |

## Examples

### Basic Usage

```yaml
- name: Run MCP Check
  uses: mcereal/mcp-check/action@v1
  with:
    config: './mcp-check.config.json'
```

### Specific Test Suites

```yaml
- name: Run MCP Check
  uses: mcereal/mcp-check/action@v1
  with:
    config: './mcp-check.config.json'
    suites: 'handshake,tool-discovery'
```

### With Chaos Testing

```yaml
- name: Run MCP Check with Chaos
  uses: mcereal/mcp-check/action@v1
  with:
    config: './mcp-check.config.json'
    chaos-enabled: 'true'
    chaos-intensity: 'medium'
```

### Generate HTML Reports

```yaml
- name: Run MCP Check
  uses: mcereal/mcp-check/action@v1
  with:
    config: './mcp-check.config.json'
    formats: 'json,html,junit'

- name: Deploy Reports to Pages
  uses: peaceiris/actions-gh-pages@v4
  if: github.ref == 'refs/heads/main'
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./mcp-check-reports
```

### Using Outputs

```yaml
- name: Run MCP Check
  id: mcp-check
  uses: mcereal/mcp-check/action@v1
  with:
    config: './mcp-check.config.json'

- name: Check Results
  run: |
    echo "Passed: ${{ steps.mcp-check.outputs.passed }}"
    echo "Failed: ${{ steps.mcp-check.outputs.failed }}"
    if [ "${{ steps.mcp-check.outputs.success }}" = "false" ]; then
      echo "::error::Some MCP conformance tests failed"
    fi
```

### Complete CI Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Unit tests
        run: npm test

  mcp-conformance:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install and build
        run: |
          npm ci
          npm run build

      - name: Start MCP Server
        run: |
          node dist/server.js &
          sleep 3

      - name: Run MCP Check
        uses: mcereal/mcp-check/action@v1
        with:
          config: './mcp-check.config.json'
          formats: 'json,html,junit,badge'

      - name: Upload Badge
        uses: actions/upload-artifact@v4
        with:
          name: mcp-check-badge
          path: ./mcp-check-reports/badge.svg
```

## Configuration File

Create a `mcp-check.config.json` in your repository:

```json
{
  "$schema": "https://raw.githubusercontent.com/mcereal/mcp-check/main/schemas/mcp-check.config.schema.json",
  "target": {
    "type": "stdio",
    "command": "node",
    "args": ["dist/server.js"]
  },
  "expectations": {
    "minProtocolVersion": "2024-11-05",
    "capabilities": ["tools", "resources"],
    "tools": [
      {
        "name": "myTool",
        "required": true
      }
    ]
  },
  "suites": ["handshake", "tool-discovery", "tool-invocation"],
  "timeouts": {
    "connectMs": 10000,
    "invokeMs": 30000
  }
}
```

## Artifacts

The action automatically uploads test reports as artifacts. These include:

- `results.json` - Full test results in JSON format
- `results.html` - Human-readable HTML report (if `html` format enabled)
- `junit.xml` - JUnit format for CI integration (if `junit` format enabled)
- `badge.svg` - Status badge (if `badge` format enabled)

## GitHub Step Summary

The action adds a summary to the GitHub Actions UI showing:

- Overall pass/fail status
- Test counts (passed, failed, warnings, total)
- Quick visual indicator of test health

## Troubleshooting

### Server not starting

Make sure your MCP server starts properly and is ready to accept connections before running mcp-check:

```yaml
- name: Start server
  run: |
    npm start &
    sleep 10  # Increase wait time if needed

- name: Verify server
  run: curl http://localhost:3000/health || echo "Server may not have health endpoint"
```

### Timeout errors

Increase timeouts in your configuration:

```json
{
  "timeouts": {
    "connectMs": 30000,
    "invokeMs": 60000
  }
}
```

### Missing tools

Ensure your server is fully initialized before running tests. Check the configuration expectations match your server's actual capabilities.
