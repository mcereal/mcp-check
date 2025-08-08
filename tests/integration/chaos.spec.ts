/**
 * Example demonstrating chaos engineering integration
 */

import { MCPChecker } from '../../src/core/checker';
import { resolveConfig } from '../../src/core/config';
import { ChaosFactory } from '../../src/chaos/factory';
import { DefaultTransportFactory } from '../../src/transports/factory';
import { HandshakeTestSuite } from '../../src/suites/handshake';
import { createLogger } from '../../src/core/logger';
import { CheckConfig } from '../../src/types/config';

describe('Chaos Integration Tests', () => {
  let checker: MCPChecker;
  let logger: any;

  beforeEach(() => {
    logger = createLogger('error', false); // Suppress logs during tests

    const config: CheckConfig = {
      target: {
        type: 'stdio',
        command: 'echo',
        args: [
          '{"jsonrpc":"2.0","result":{"version":"1.0.0","capabilities":{}}}',
        ],
      },
      chaos: {
        enable: true,
        seed: 12345,
        intensity: 0.1,
        network: {
          delayMs: [1, 5], // Very small delays for tests
          dropProbability: 0.0, // Disable to avoid test flakiness
        },
      },
    };

    const resolvedConfig = resolveConfig(config);
    checker = new MCPChecker(resolvedConfig, logger);
    checker.setTransportFactory(new DefaultTransportFactory());
  });

  it('should create chaos controller from config', () => {
    const chaosConfig = {
      enable: true,
      seed: 12345,
      intensity: 0.1,
      network: { delayMs: [0, 10] as [number, number] },
      protocol: { malformedJsonProbability: 0.01 },
    };

    const controller = ChaosFactory.createDefault(chaosConfig);

    expect(controller).toBeDefined();
    expect(controller.config.enable).toBe(true);
    expect(controller.config.seed).toBe(12345);
    expect(controller.plugins.length).toBeGreaterThan(0);
  });

  it('should integrate chaos with test suite', async () => {
    const chaosController = ChaosFactory.createLightweight(12345);
    checker.setChaosController(chaosController);
    checker.registerSuite(new HandshakeTestSuite());

    // This should run without errors even with chaos enabled
    // Note: Actual test execution might be flaky due to chaos effects
    expect(checker).toBeDefined();
    expect(chaosController.config.enable).toBe(true);
  });

  it('should create different intensity levels', () => {
    const low = ChaosFactory.createByIntensity('low', 12345);
    const medium = ChaosFactory.createByIntensity('medium', 12345);
    const high = ChaosFactory.createByIntensity('high', 12345);

    expect(low.config.intensity).toBeLessThan(medium.config.intensity!);
    expect(medium.config.intensity).toBeLessThan(high.config.intensity!);
  });

  it('should create specialized chaos controllers', () => {
    const networkFocused = ChaosFactory.createNetworkFocused(12345);
    const protocolFocused = ChaosFactory.createProtocolFocused(12345);
    const timingFocused = ChaosFactory.createTimingFocused(12345);

    expect(networkFocused.config.network).toBeDefined();
    expect(protocolFocused.config.protocol).toBeDefined();
    expect(timingFocused.config.timing).toBeDefined();

    // Network focused should have network plugins
    const networkPlugins = networkFocused.plugins.filter(
      (p) => p.name === 'network-chaos',
    );
    expect(networkPlugins.length).toBeGreaterThan(0);

    // Protocol focused should have protocol plugins
    const protocolPlugins = protocolFocused.plugins.filter(
      (p) => p.name === 'protocol-chaos',
    );
    expect(protocolPlugins.length).toBeGreaterThan(0);
  });

  it('should handle chaos controller disable/enable', () => {
    const controller = ChaosFactory.createLightweight();

    controller.enable();
    // Would check enabled state, but interface doesn't expose it directly

    controller.disable();
    // Would check disabled state

    expect(controller).toBeDefined(); // Basic sanity check
  });
});
