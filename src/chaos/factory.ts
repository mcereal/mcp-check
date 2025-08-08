/**
 * Chaos factory for creating preconfigured chaos setups
 */

import { ChaosConfig, ChaosController } from '../types/chaos';
import { DefaultChaosController } from './controller';
import { NetworkChaosPlugin } from './network-chaos';
import { ProtocolChaosPlugin } from './protocol-chaos';
import { StreamChaosPlugin } from './stream-chaos';
import { TimingChaosPlugin } from './timing-chaos';

/**
 * Factory for creating chaos controllers with preconfigured plugins
 */
export class ChaosFactory {
  /**
   * Create a default chaos controller with all standard plugins
   */
  static createDefault(config: ChaosConfig): ChaosController {
    const controller = new DefaultChaosController(config);

    // Register all standard chaos plugins
    if (config.network) {
      const networkPlugin = new NetworkChaosPlugin(config.network);
      controller.register(networkPlugin);
    }

    if (config.protocol) {
      const protocolPlugin = new ProtocolChaosPlugin(config.protocol);
      controller.register(protocolPlugin);
    }

    if (config.stream) {
      const streamPlugin = new StreamChaosPlugin(config.stream);
      controller.register(streamPlugin);
    }

    if (config.timing) {
      const timingPlugin = new TimingChaosPlugin(config.timing);
      controller.register(timingPlugin);
    }

    return controller;
  }

  /**
   * Create a lightweight chaos controller with minimal disruption
   */
  static createLightweight(seed?: number): ChaosController {
    const config: ChaosConfig = {
      enable: true,
      seed: seed || Date.now(),
      intensity: 0.05, // Very low intensity
      network: {
        delayMs: [0, 10],
        dropProbability: 0.001,
      },
      protocol: {
        injectAbortProbability: 0.001,
        malformedJsonProbability: 0.0005,
      },
    };

    return this.createDefault(config);
  }

  /**
   * Create an aggressive chaos controller for stress testing
   */
  static createAggressive(seed?: number): ChaosController {
    const config: ChaosConfig = {
      enable: true,
      seed: seed || Date.now(),
      intensity: 0.3, // High intensity
      network: {
        delayMs: [0, 200],
        dropProbability: 0.05,
        duplicateProbability: 0.02,
        reorderProbability: 0.02,
        corruptProbability: 0.01,
      },
      protocol: {
        injectAbortProbability: 0.02,
        malformedJsonProbability: 0.01,
        unexpectedMessageProbability: 0.03,
        invalidSchemaoProbability: 0.02,
      },
      stream: {
        chunkJitterMs: [0, 100],
        reorderProbability: 0.03,
        duplicateChunkProbability: 0.02,
        splitChunkProbability: 0.03,
      },
      timing: {
        clockSkewMs: [-5000, 5000],
        processingDelayMs: [0, 200],
        timeoutReductionFactor: 0.5,
      },
    };

    return this.createDefault(config);
  }

  /**
   * Create a network-focused chaos controller
   */
  static createNetworkFocused(seed?: number): ChaosController {
    const config: ChaosConfig = {
      enable: true,
      seed: seed || Date.now(),
      intensity: 0.2,
      network: {
        delayMs: [10, 500],
        dropProbability: 0.1,
        duplicateProbability: 0.05,
        reorderProbability: 0.05,
        corruptProbability: 0.02,
      },
    };

    return this.createDefault(config);
  }

  /**
   * Create a protocol-focused chaos controller
   */
  static createProtocolFocused(seed?: number): ChaosController {
    const config: ChaosConfig = {
      enable: true,
      seed: seed || Date.now(),
      intensity: 0.15,
      protocol: {
        injectAbortProbability: 0.05,
        malformedJsonProbability: 0.03,
        unexpectedMessageProbability: 0.08,
        invalidSchemaoProbability: 0.05,
      },
    };

    return this.createDefault(config);
  }

  /**
   * Create a timing-focused chaos controller
   */
  static createTimingFocused(seed?: number): ChaosController {
    const config: ChaosConfig = {
      enable: true,
      seed: seed || Date.now(),
      intensity: 0.25,
      timing: {
        clockSkewMs: [-10000, 10000],
        processingDelayMs: [50, 300],
        timeoutReductionFactor: 0.3,
      },
      stream: {
        chunkJitterMs: [0, 200],
        reorderProbability: 0.1,
      },
    };

    return this.createDefault(config);
  }

  /**
   * Create chaos controller from configuration intensity level
   */
  static createByIntensity(
    intensity: 'low' | 'medium' | 'high' | 'extreme',
    seed?: number,
  ): ChaosController {
    switch (intensity) {
      case 'low':
        return this.createLightweight(seed);

      case 'medium':
        return this.createDefault({
          enable: true,
          seed: seed || Date.now(),
          intensity: 0.1,
          network: { delayMs: [0, 50], dropProbability: 0.01 },
          protocol: { malformedJsonProbability: 0.005 },
        });

      case 'high':
        return this.createAggressive(seed);

      case 'extreme':
        const extremeConfig: ChaosConfig = {
          enable: true,
          seed: seed || Date.now(),
          intensity: 0.5,
          network: {
            delayMs: [0, 1000],
            dropProbability: 0.15,
            duplicateProbability: 0.1,
            reorderProbability: 0.1,
            corruptProbability: 0.05,
          },
          protocol: {
            injectAbortProbability: 0.1,
            malformedJsonProbability: 0.05,
            unexpectedMessageProbability: 0.15,
            invalidSchemaoProbability: 0.1,
          },
          stream: {
            chunkJitterMs: [0, 500],
            reorderProbability: 0.2,
            duplicateChunkProbability: 0.1,
            splitChunkProbability: 0.15,
          },
          timing: {
            clockSkewMs: [-30000, 30000],
            processingDelayMs: [0, 500],
            timeoutReductionFactor: 0.2,
          },
        };
        return this.createDefault(extremeConfig);

      default:
        throw new Error(`Unknown chaos intensity: ${intensity}`);
    }
  }
}
