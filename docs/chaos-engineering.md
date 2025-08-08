# Chaos Engineering in MCP-Check

The chaos engineering system in MCP-Check allows you to inject controlled failures and edge cases into your testing to validate that your MCP server handles unexpected conditions gracefully.

## Overview

Chaos engineering works by intercepting messages and connections at various layers and introducing realistic disruptions:

- **Network Chaos**: Simulates network issues like latency, packet loss, and corruption
- **Protocol Chaos**: Injects MCP protocol violations like malformed JSON or unexpected messages
- **Stream Chaos**: Disrupts streaming data with reordering, duplication, and chunking issues
- **Timing Chaos**: Creates timing-related edge cases like clock skew and processing delays

## Configuration

### Basic Configuration

Add chaos configuration to your `mcp-check.config.json`:

```json
{
  "chaos": {
    "enable": true,
    "seed": 12345,
    "intensity": 0.1,
    "network": {
      "delayMs": [0, 100],
      "dropProbability": 0.01,
      "duplicateProbability": 0.005,
      "reorderProbability": 0.005,
      "corruptProbability": 0.001
    },
    "protocol": {
      "injectAbortProbability": 0.005,
      "malformedJsonProbability": 0.001,
      "unexpectedMessageProbability": 0.01,
      "invalidSchemaoProbability": 0.005
    },
    "stream": {
      "chunkJitterMs": [0, 50],
      "reorderProbability": 0.01,
      "duplicateChunkProbability": 0.005,
      "splitChunkProbability": 0.01
    },
    "timing": {
      "clockSkewMs": [-1000, 1000],
      "processingDelayMs": [0, 100],
      "timeoutReductionFactor": 0.8
    }
  }
}
```

### CLI Options

Control chaos directly from the command line:

```bash
# Enable lightweight chaos with seed for reproducibility
npx mcp-check --chaos-seed 12345 --chaos-intensity low

# Enable specific types of chaos
npx mcp-check --chaos-network --chaos-protocol

# Use preset intensity levels
npx mcp-check --chaos-intensity medium  # low, medium, high, extreme

# Disable chaos completely
npx mcp-check --no-chaos
```

## Chaos Types

### Network Chaos

Simulates real-world network conditions:

```typescript
{
  "network": {
    "delayMs": [10, 200],        // Random delay range
    "dropProbability": 0.05,      // 5% chance to drop messages
    "duplicateProbability": 0.02, // 2% chance to duplicate
    "reorderProbability": 0.02,   // 2% chance to reorder
    "corruptProbability": 0.01    // 1% chance to corrupt data
  }
}
```

**Effects**:

- Message delays between min/max range
- Dropped messages (connection errors)
- Duplicate message delivery
- Out-of-order message arrival
- Data corruption in transit

### Protocol Chaos

Injects MCP protocol violations:

```typescript
{
  "protocol": {
    "injectAbortProbability": 0.02,        // Connection aborts
    "malformedJsonProbability": 0.01,      // Invalid JSON
    "unexpectedMessageProbability": 0.03,  // Wrong message types
    "invalidSchemaoProbability": 0.02      // Schema violations
  }
}
```

**Effects**:

- Malformed JSON messages
- Unexpected message types (wrong method names)
- Invalid message IDs and structure
- Schema violations (missing fields, wrong types)
- Connection aborts mid-conversation

### Stream Chaos

Disrupts streaming data flows:

```typescript
{
  "stream": {
    "chunkJitterMs": [0, 100],           // Delay between chunks
    "reorderProbability": 0.03,          // Chunk reordering
    "duplicateChunkProbability": 0.02,   // Duplicate chunks
    "splitChunkProbability": 0.03        // Split large messages
  }
}
```

**Effects**:

- Variable delays between streaming chunks
- Out-of-order chunk delivery
- Duplicate chunk reception
- Large messages split into multiple parts

### Timing Chaos

Creates timing-related edge cases:

```typescript
{
  "timing": {
    "clockSkewMs": [-5000, 5000],     // Clock difference simulation
    "processingDelayMs": [0, 200],    // Random processing delays
    "timeoutReductionFactor": 0.5     // Reduce timeout windows
  }
}
```

**Effects**:

- Clock skew between client/server
- Artificial processing delays
- Timestamp manipulation in messages
- Reduced timeout windows for race conditions

## Intensity Levels

Pre-configured intensity levels for different testing scenarios:

### Low Intensity (0.05)

- Minimal disruption for basic resilience testing
- Very low probability chaos events
- Suitable for continuous integration

### Medium Intensity (0.1)

- Balanced chaos for thorough testing
- Moderate probability events
- Good for development testing

### High Intensity (0.3)

- Aggressive chaos for stress testing
- High probability disruptions
- Pre-production validation

### Extreme Intensity (0.5)

- Maximum chaos for edge case discovery
- Very high probability failures
- Research and development scenarios

## Reproducible Testing

Use seeds for deterministic chaos patterns:

```bash
# Same seed produces identical chaos sequence
npx mcp-check --chaos-seed 12345
npx mcp-check --chaos-seed 12345  # Identical behavior

# Different seeds for varied testing
npx mcp-check --chaos-seed 54321  # Different chaos pattern
```

## Programming Interface

### Create Chaos Controllers

```typescript
import { ChaosFactory } from '@mcereal/mcp-check/chaos';

// Preset configurations
const lightweight = ChaosFactory.createLightweight(12345);
const aggressive = ChaosFactory.createAggressive(12345);

// By intensity level
const medium = ChaosFactory.createByIntensity('medium', 12345);

// Specialized chaos
const networkFocused = ChaosFactory.createNetworkFocused(12345);
const protocolFocused = ChaosFactory.createProtocolFocused(12345);
const timingFocused = ChaosFactory.createTimingFocused(12345);

// Custom configuration
const custom = ChaosFactory.createDefault({
  enable: true,
  seed: 12345,
  intensity: 0.15,
  network: { delayMs: [0, 50] },
  protocol: { malformedJsonProbability: 0.01 },
});
```

### Custom Chaos Plugins

Implement your own chaos logic:

```typescript
import { ChaosPlugin, ChaosContext } from '@mcereal/mcp-check/types';

class CustomChaosPlugin implements ChaosPlugin {
  readonly name = 'custom-chaos';
  readonly description = 'Custom chaos implementation';
  enabled = true;

  async initialize(context: ChaosContext): Promise<void> {
    // Initialize plugin
  }

  async beforeSend(message: any): Promise<any> {
    // Modify outgoing messages
    return message;
  }

  async afterReceive(message: any): Promise<any> {
    // Modify incoming messages
    return message;
  }

  async restore(): Promise<void> {
    // Clean up resources
  }
}

// Register with controller
const controller = ChaosFactory.createDefault(config);
controller.register(new CustomChaosPlugin());
```

## Best Practices

1. **Start Small**: Begin with low intensity and gradually increase
2. **Use Seeds**: Always use seeds for reproducible test runs
3. **Monitor Logs**: Enable verbose logging to understand chaos effects
4. **Test Incrementally**: Test individual chaos types before combining
5. **Document Failures**: Record chaos-induced failures for analysis

## Troubleshooting

### Tests Failing with Chaos

1. Check if failures are chaos-induced (logs will show chaos activity)
2. Reduce intensity or disable specific chaos types
3. Use fixed seeds to reproduce issues consistently

### Performance Impact

1. Chaos adds overhead - use lower intensities for CI
2. Network chaos can significantly slow tests
3. Monitor test duration and adjust timeouts accordingly

### False Positives

1. Some chaos effects may mask real bugs
2. Run tests both with and without chaos
3. Use chaos to discover edge cases, not replace normal testing

## Examples

### Basic Chaos Testing

```bash
# Enable basic chaos with default settings
npx mcp-check --chaos-intensity low --chaos-seed 42

# Test specific failure modes
npx mcp-check --chaos-network --chaos-seed 42
npx mcp-check --chaos-protocol --chaos-seed 42
```

### CI Integration

```yaml
# GitHub Actions example
- name: Test with Chaos
  run: |
    npx mcp-check --chaos-intensity low --chaos-seed ${{ github.run_id }}
    npx mcp-check --chaos-network --chaos-seed ${{ github.run_id }}
```

### Development Workflow

```bash
# Normal testing
npx mcp-check

# Add light chaos
npx mcp-check --chaos-intensity low

# Stress test before release
npx mcp-check --chaos-intensity high --chaos-seed 12345
```
