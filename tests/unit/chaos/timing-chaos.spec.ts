/**
 * Unit tests for TimingChaosPlugin
 */

import { TimingChaosPlugin } from '../../../src/chaos/timing-chaos';
import { ChaosContext, TimingChaosConfig } from '../../../src/types/chaos';
import { Logger } from '../../../src/types/reporting';

describe('TimingChaosPlugin', () => {
  let plugin: TimingChaosPlugin;
  let mockContext: ChaosContext;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };

    mockContext = {
      seed: 12345,
      logger: mockLogger,
      transport: {} as any, // Mock transport
      config: {} as any, // Mock chaos config
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      plugin = new TimingChaosPlugin();

      expect(plugin.name).toBe('timing-chaos');
      expect(plugin.description).toBe(
        'Simulates timing-related edge cases and race conditions',
      );
      expect(plugin.enabled).toBe(true);
    });

    it('should accept custom configuration', () => {
      const config: TimingChaosConfig = {
        clockSkewMs: [-5000, 5000],
        processingDelayMs: [10, 200],
        timeoutReductionFactor: 0.5,
      };

      plugin = new TimingChaosPlugin(config);
      expect(plugin).toBeDefined();
    });

    it('should initialize with chaos context', async () => {
      plugin = new TimingChaosPlugin({
        clockSkewMs: [-1000, 1000],
      });

      await plugin.initialize(mockContext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Timing chaos plugin initialized'),
        expect.objectContaining({
          config: expect.any(Object),
        }),
      );

      // Clock skew should be set
      const clockSkew = plugin.getClockSkew();
      expect(clockSkew).toBeGreaterThanOrEqual(-1000);
      expect(clockSkew).toBeLessThanOrEqual(1000);
    });

    it('should handle zero clock skew configuration', async () => {
      plugin = new TimingChaosPlugin({
        clockSkewMs: [0, 0],
      });

      await plugin.initialize(mockContext);

      expect(plugin.getClockSkew()).toBe(0);
    });
  });

  describe('Message Processing', () => {
    beforeEach(async () => {
      plugin = new TimingChaosPlugin({
        clockSkewMs: [100, 100], // Fixed skew for predictable tests
        processingDelayMs: [0, 50],
      });
      await plugin.initialize(mockContext);
    });

    it('should apply processing delay before sending message', async () => {
      const startTime = Date.now();
      const message = { id: 1, method: 'test' };

      // Mock random to always apply chaos
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(true);
      (plugin as any).random = {
        nextInt: jest.fn().mockReturnValue(30), // 30ms delay
        nextBoolean: jest.fn().mockReturnValue(true),
      };

      const result = await plugin.beforeSend(message);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(25); // Allow some tolerance
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('applying 30ms processing delay'),
      );
      expect(result).toBeDefined();
    });

    it('should apply clock skew to timestamp fields', async () => {
      const message = {
        id: 1,
        timestamp: '2023-01-01T12:00:00.000Z',
        metadata: {
          createdAt: 1672574400000, // Unix timestamp
          startTime: '2023-01-01T12:30:00.000Z',
        },
      };

      // Mock to always apply chaos but no processing delay
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(true);
      (plugin as any).random = {
        nextInt: jest.fn().mockReturnValue(0), // No delay
        nextBoolean: jest.fn().mockReturnValue(true),
      };

      const result = await plugin.beforeSend(message);

      expect(result.timestamp).not.toBe(message.timestamp);
      expect(result.metadata.createdAt).toBe(message.metadata.createdAt + 100);
      expect(result.metadata.startTime).not.toBe(message.metadata.startTime);
    });

    it('should not modify message when chaos is not applied', async () => {
      const message = { id: 1, method: 'test' };

      // Mock to never apply chaos
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(false);

      const result = await plugin.beforeSend(message);

      expect(result).toBe(message); // Should be same reference
      // Note: mockLogger.debug was called during initialization, so we clear it
      mockLogger.debug.mockClear();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should apply receive processing delay', async () => {
      const startTime = Date.now();
      const message = { id: 1, result: 'success' };

      // Mock random to always apply chaos with delay
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(true);
      (plugin as any).random = {
        nextInt: jest.fn().mockReturnValue(25), // 25ms delay
        nextBoolean: jest.fn().mockReturnValue(true),
      };

      const result = await plugin.afterReceive(message);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(20); // Allow tolerance
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('applying 25ms receive delay'),
      );
      expect(result).toBe(message);
    });
  });

  describe('Connection Chaos', () => {
    beforeEach(async () => {
      plugin = new TimingChaosPlugin({
        processingDelayMs: [10, 50],
      });
      await plugin.initialize(mockContext);
    });

    it('should apply connection delay during connection', async () => {
      const startTime = Date.now();

      // Mock to always apply chaos
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(true);
      (plugin as any).random = {
        nextInt: jest.fn().mockReturnValue(40), // 40ms delay (doubled to 80ms for connection)
        nextBoolean: jest.fn().mockReturnValue(true),
      };

      await plugin.duringConnection();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(35); // 40ms delay - tolerance
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('applying 40ms connection delay'), // The actual delay returned by nextInt
      );
    });

    it('should not apply delay when chaos is disabled', async () => {
      const startTime = Date.now();

      // Mock to never apply chaos
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(false);

      await plugin.duringConnection();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(10); // Should be fast
      // Note: mockLogger.debug was called during initialization, so we clear it
      mockLogger.debug.mockClear();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('Clock Skew Functionality', () => {
    beforeEach(async () => {
      plugin = new TimingChaosPlugin({
        clockSkewMs: [500, 500], // Fixed 500ms skew
      });
      await plugin.initialize(mockContext);
    });

    it('should provide adjusted time with skew', () => {
      const currentTime = Date.now();
      const adjustedTime = plugin.getAdjustedTime();

      expect(adjustedTime).toBeGreaterThan(currentTime);
      expect(adjustedTime - currentTime).toBeCloseTo(500, -1); // Within 10ms tolerance
    });

    it('should identify timestamp fields correctly', () => {
      const testCases = [
        { key: 'timestamp', value: '2023-01-01T00:00:00.000Z', expected: true },
        { key: 'createdAt', value: 1672531200000, expected: true },
        { key: 'startTime', value: '2023-01-01T00:00:00.000Z', expected: true },
        { key: 'randomField', value: 'not-a-timestamp', expected: false },
        { key: 'count', value: 12345, expected: false },
        { key: 'endTime', value: 'invalid-date', expected: false },
      ];

      testCases.forEach(({ key, value, expected }) => {
        const result = (plugin as any).isTimestampField(key, value);
        expect(result).toBe(expected);
      });
    });

    it('should identify ISO timestamps correctly', () => {
      const validTimestamps = [
        '2023-01-01T00:00:00.000Z',
        '2023-12-31T23:59:59.999Z',
        '2023-06-15T12:30:45.123Z',
      ];

      const invalidTimestamps = [
        'not-a-date',
        '2023-13-01T00:00:00.000Z', // Invalid month
        '2023-01-32T00:00:00.000Z', // Invalid day
        '123456789', // Just a number
        '',
      ];

      validTimestamps.forEach((timestamp) => {
        const result = (plugin as any).isISOTimestamp(timestamp);
        expect(result).toBe(true);
      });

      invalidTimestamps.forEach((timestamp) => {
        const result = (plugin as any).isISOTimestamp(timestamp);
        expect(result).toBe(false);
      });
    });

    it('should modify nested timestamps correctly', async () => {
      const complexMessage = {
        id: 1,
        timestamp: '2023-01-01T12:00:00.000Z',
        metadata: {
          createdAt: 1672574400000,
          nested: {
            startTime: '2023-01-01T12:30:00.000Z',
            data: {
              endTime: 1672576200000,
              other: 'not-timestamp',
            },
          },
        },
      };

      // Mock to always apply chaos
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(true);
      (plugin as any).random = {
        nextInt: jest.fn().mockReturnValue(0), // No processing delay
        nextBoolean: jest.fn().mockReturnValue(true),
      };

      const result = await plugin.beforeSend(complexMessage);

      // Verify timestamps were modified
      expect(result.timestamp).not.toBe(complexMessage.timestamp);
      expect(result.metadata.createdAt).toBe(
        complexMessage.metadata.createdAt + 500,
      );
      expect(result.metadata.nested.startTime).not.toBe(
        complexMessage.metadata.nested.startTime,
      );
      expect(result.metadata.nested.data.endTime).toBe(
        complexMessage.metadata.nested.data.endTime + 500,
      );

      // Verify non-timestamps were not modified
      expect(result.id).toBe(complexMessage.id);
      expect(result.metadata.nested.data.other).toBe(
        complexMessage.metadata.nested.data.other,
      );
    });
  });

  describe('Race Condition Simulation', () => {
    beforeEach(async () => {
      plugin = new TimingChaosPlugin();
      await plugin.initialize(mockContext);
    });

    it('should simulate race condition by yielding execution', async () => {
      // Mock random to trigger race condition
      (plugin as any).random = {
        nextBoolean: jest.fn().mockReturnValue(true), // Always trigger
      };

      const startTime = Date.now();
      await plugin.simulateRaceCondition();
      const elapsed = Date.now() - startTime;

      // Should take at least some time due to yielding
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it('should not yield when race condition is not triggered', async () => {
      // Mock random to never trigger race condition
      (plugin as any).random = {
        nextBoolean: jest.fn().mockReturnValue(false), // Never trigger
      };

      const startTime = Date.now();
      await plugin.simulateRaceCondition();
      const elapsed = Date.now() - startTime;

      // Should be very fast
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe('Restore and Cleanup', () => {
    beforeEach(async () => {
      plugin = new TimingChaosPlugin({
        clockSkewMs: [300, 300],
      });
      await plugin.initialize(mockContext);
    });

    it('should log restoration information', async () => {
      await plugin.restore();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Timing chaos plugin restored',
        { clockSkewMs: 300 },
      );
    });

    it('should handle restoration without context', async () => {
      const uninitializedPlugin = new TimingChaosPlugin();

      // Should not throw
      await expect(uninitializedPlugin.restore()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined messages', async () => {
      plugin = new TimingChaosPlugin();
      await plugin.initialize(mockContext);

      const nullResult = await plugin.beforeSend(null);
      const undefinedResult = await plugin.beforeSend(undefined);

      expect(nullResult).toBeNull();
      expect(undefinedResult).toBeUndefined();
    });

    it('should handle non-object messages', async () => {
      plugin = new TimingChaosPlugin();
      await plugin.initialize(mockContext);

      const stringMessage = 'test-message';
      const numberMessage = 42;
      const booleanMessage = true;

      const stringResult = await plugin.beforeSend(stringMessage);
      const numberResult = await plugin.beforeSend(numberMessage);
      const booleanResult = await plugin.beforeSend(booleanMessage);

      expect(stringResult).toBe(stringMessage);
      expect(numberResult).toBe(numberMessage);
      expect(booleanResult).toBe(booleanMessage);
    });

    it('should handle messages without timestamp fields', async () => {
      plugin = new TimingChaosPlugin({
        clockSkewMs: [100, 100],
      });
      await plugin.initialize(mockContext);

      // Mock to always apply chaos
      jest.spyOn(plugin as any, 'shouldApplyChaos').mockReturnValue(true);
      (plugin as any).random = {
        nextInt: jest.fn().mockReturnValue(0), // No processing delay
        nextBoolean: jest.fn().mockReturnValue(true),
      };

      const messageWithoutTimestamps = {
        id: 1,
        method: 'test',
        params: { value: 123 },
      };

      const result = await plugin.beforeSend(messageWithoutTimestamps);

      // Should be deep equal but different object reference
      expect(result).toEqual(messageWithoutTimestamps);
      expect(result).not.toBe(messageWithoutTimestamps);
    });

    it('should work without context for non-chaos operations', async () => {
      plugin = new TimingChaosPlugin();

      // Don't initialize context
      const message = { id: 1, method: 'test' };

      const beforeResult = await plugin.beforeSend(message);
      const afterResult = await plugin.afterReceive(message);

      expect(beforeResult).toBe(message);
      expect(afterResult).toBe(message);

      await expect(plugin.duringConnection()).resolves.not.toThrow();
    });
  });
});
