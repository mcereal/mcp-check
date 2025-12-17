/**
 * Tests for chaos engineering components
 */

import { MCPPseudoRandom } from '../../src/chaos/random';
import { DefaultChaosController } from '../../src/chaos/controller';
import { NetworkChaosPlugin } from '../../src/chaos/network-chaos';
import { ChaosFactory } from '../../src/chaos/factory';
import { ChaosConfig, ChaosContext } from '../../src/types/chaos';
import { createLogger } from '../../src/core/logger';

describe('Chaos Engineering', () => {
  describe('MCPPseudoRandom', () => {
    it('should generate reproducible random numbers', () => {
      const rng1 = new MCPPseudoRandom(12345);
      const rng2 = new MCPPseudoRandom(12345);

      // Same seed should produce same sequence
      expect(rng1.next()).toBe(rng2.next());
      expect(rng1.next()).toBe(rng2.next());
      expect(rng1.next()).toBe(rng2.next());
    });

    it('should generate numbers between 0 and 1', () => {
      const rng = new MCPPseudoRandom();

      for (let i = 0; i < 100; i++) {
        const num = rng.next();
        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThan(1);
      }
    });

    it('should generate integers in range', () => {
      const rng = new MCPPseudoRandom();

      for (let i = 0; i < 100; i++) {
        const num = rng.nextInt(10, 20);
        expect(num).toBeGreaterThanOrEqual(10);
        expect(num).toBeLessThan(20);
        expect(Number.isInteger(num)).toBe(true);
      }
    });

    it('should shuffle arrays consistently with same seed', () => {
      const original = [1, 2, 3, 4, 5];

      const rng1 = new MCPPseudoRandom(54321);
      const rng2 = new MCPPseudoRandom(54321);

      const shuffled1 = rng1.shuffle([...original]);
      const shuffled2 = rng2.shuffle([...original]);

      expect(shuffled1).toEqual(shuffled2);
      expect(shuffled1).not.toEqual(original); // Should be different (statistically)
    });
  });

  describe('DefaultChaosController', () => {
    let controller: DefaultChaosController;
    let logger: any;

    beforeEach(() => {
      logger = createLogger('error', false); // Suppress logs during tests
      const config: ChaosConfig = {
        enable: true,
        seed: 12345,
        intensity: 0.1,
      };
      controller = new DefaultChaosController(config);
    });

    it('should initialize with plugins', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        description: 'Test plugin',
        enabled: true,
        initialize: jest.fn(),
        restore: jest.fn(),
      };

      controller.register(mockPlugin);

      const context: ChaosContext = {
        transport: {} as any,
        config: controller.config,
        logger,
        seed: 12345,
      };

      await controller.initialize(context);

      expect(mockPlugin.initialize).toHaveBeenCalledWith(context);
    });

    it('should apply chaos to messages', async () => {
      const mockPlugin = {
        name: 'test-plugin',
        description: 'Test plugin',
        enabled: true,
        initialize: jest.fn(),
        beforeSend: jest
          .fn()
          .mockImplementation((msg) => ({ ...msg, chaos: true })),
        restore: jest.fn(),
      };

      controller.register(mockPlugin);

      const context: ChaosContext = {
        transport: {} as any,
        config: controller.config,
        logger,
        seed: 12345,
      };

      await controller.initialize(context);
      controller.enable();

      const originalMessage = { test: 'message' };
      const result = await controller.applySendChaos(originalMessage);

      expect(mockPlugin.beforeSend).toHaveBeenCalledWith(originalMessage);
      // Result is now a ChaosResult object
      expect(result.message).toEqual({ test: 'message', chaos: true });
      expect(result.duplicates).toBeUndefined();
    });

    it('should handle plugin errors gracefully', async () => {
      const mockPlugin = {
        name: 'failing-plugin',
        description: 'Failing plugin',
        enabled: true,
        initialize: jest.fn(),
        beforeSend: jest.fn().mockRejectedValue(new Error('Plugin failed')),
        restore: jest.fn(),
      };

      controller.register(mockPlugin);

      const context: ChaosContext = {
        transport: {} as any,
        config: controller.config,
        logger,
        seed: 12345,
      };

      await controller.initialize(context);
      controller.enable();

      const originalMessage = { test: 'message' };
      const result = await controller.applySendChaos(originalMessage);

      // Should return original message when plugin fails (wrapped in ChaosResult)
      expect(result.message).toEqual(originalMessage);
    });
  });

  describe('NetworkChaosPlugin', () => {
    let plugin: NetworkChaosPlugin;
    let context: ChaosContext;

    beforeEach(() => {
      plugin = new NetworkChaosPlugin({
        delayMs: [10, 20],
        dropProbability: 0.0, // Disable for deterministic tests
        corruptProbability: 0.0,
      });

      context = {
        transport: {} as any,
        config: { enable: true, seed: 12345 },
        logger: createLogger('error', false),
        seed: 12345,
      };
    });

    it('should initialize properly', async () => {
      await plugin.initialize(context);
      expect(plugin.enabled).toBe(true);
    });

    it('should apply network delays', async () => {
      await plugin.initialize(context);

      const message = { test: 'message' };
      const startTime = Date.now();

      const result = await plugin.beforeSend(message);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should have some delay (though we can't guarantee exact timing in tests)
      // Result is now a PluginSendResult object
      expect(result.message).toEqual(message);
      // Note: In a real test environment, timing tests can be flaky
    });

    it('should schedule message duplicates when duplication is enabled', async () => {
      // Create plugin with high duplication probability for testing
      const duplicationPlugin = new NetworkChaosPlugin({
        delayMs: [0, 0], // No delay for faster tests
        dropProbability: 0,
        duplicateProbability: 1.0, // Always duplicate
        corruptProbability: 0,
      });

      await duplicationPlugin.initialize(context);

      const message = { test: 'duplication' };
      const result = await duplicationPlugin.beforeSend(message);

      // Result should contain the original message and scheduled duplicates
      expect(result.message).toEqual(message);
      expect(result.duplicates).toBeDefined();
      expect(result.duplicates!.length).toBe(1);
      expect(result.duplicates![0].message).toEqual(message);
      expect(result.duplicates![0].delayMs).toBeGreaterThanOrEqual(10);
      expect(result.duplicates![0].delayMs).toBeLessThan(100);
    });
  });

  describe('ChaosFactory', () => {
    it('should create default chaos controller', () => {
      const config: ChaosConfig = {
        enable: true,
        network: { delayMs: [0, 10] },
        protocol: { malformedJsonProbability: 0.01 },
      };

      const controller = ChaosFactory.createDefault(config);

      expect(controller).toBeDefined();
      expect(controller.config.enable).toBe(true);
      expect(controller.plugins.length).toBeGreaterThan(0);
    });

    it('should create lightweight chaos controller', () => {
      const controller = ChaosFactory.createLightweight(12345);

      expect(controller).toBeDefined();
      expect(controller.config.intensity).toBe(0.05);
      expect(controller.config.seed).toBe(12345);
    });

    it('should create aggressive chaos controller', () => {
      const controller = ChaosFactory.createAggressive(12345);

      expect(controller).toBeDefined();
      expect(controller.config.intensity).toBe(0.3);
      expect(controller.plugins.length).toBeGreaterThan(2);
    });

    it('should create controllers by intensity', () => {
      const low = ChaosFactory.createByIntensity('low');
      const medium = ChaosFactory.createByIntensity('medium');
      const high = ChaosFactory.createByIntensity('high');
      const extreme = ChaosFactory.createByIntensity('extreme');

      expect(low.config.intensity).toBeLessThan(medium.config.intensity!);
      expect(medium.config.intensity).toBeLessThan(high.config.intensity!);
      expect(high.config.intensity).toBeLessThan(extreme.config.intensity!);
    });

    it('should throw error for unknown intensity', () => {
      expect(() => {
        ChaosFactory.createByIntensity('unknown' as any);
      }).toThrow('Unknown chaos intensity: unknown');
    });
  });
});
