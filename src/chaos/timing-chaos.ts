/**
 * Timing chaos plugin - simulates timing-related disruptions
 */

import { ChaosPlugin, ChaosContext, TimingChaosConfig } from '../types/chaos';
import { MCPPseudoRandom } from './random';

/**
 * Simulates timing-related chaos like clock skew, processing delays, etc.
 */
export class TimingChaosPlugin implements ChaosPlugin {
  readonly name = 'timing-chaos';
  readonly description =
    'Simulates timing-related edge cases and race conditions';
  enabled = true;

  private config: TimingChaosConfig;
  private context?: ChaosContext;
  private random: MCPPseudoRandom;
  private baseTime: number = Date.now();
  private clockSkew: number = 0;

  constructor(config: TimingChaosConfig = {}) {
    this.config = {
      clockSkewMs: [-1000, 1000],
      processingDelayMs: [0, 100],
      timeoutReductionFactor: 0.8,
      ...config,
    };
    this.random = new MCPPseudoRandom();
  }

  async initialize(context: ChaosContext): Promise<void> {
    this.context = context;
    this.random = new MCPPseudoRandom(context.seed);
    this.baseTime = Date.now();

    // Set a persistent clock skew for this session
    if (this.config.clockSkewMs) {
      const [min, max] = this.config.clockSkewMs;
      this.clockSkew = this.random.nextInt(min, max);
      context.logger.debug(
        `Timing chaos plugin initialized with ${this.clockSkew}ms clock skew`,
        {
          config: this.config,
        },
      );
    }
  }

  async beforeSend(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Apply processing delay
    if (this.config.processingDelayMs) {
      const [min, max] = this.config.processingDelayMs;
      const delay = this.random.nextInt(min, max);
      if (delay > 0) {
        this.context.logger.debug(
          `Timing chaos: applying ${delay}ms processing delay`,
        );
        await this.sleep(delay);
      }
    }

    // Modify timestamps in message if present
    if (typeof message === 'object' && message !== null) {
      const modifiedMessage = this.applyClockSkew(message);
      return modifiedMessage;
    }

    return message;
  }

  async afterReceive(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Apply receive processing delay
    if (this.config.processingDelayMs) {
      const [min, max] = this.config.processingDelayMs;
      const delay = this.random.nextInt(min, max);
      if (delay > 0) {
        this.context.logger.debug(
          `Timing chaos: applying ${delay}ms receive delay`,
        );
        await this.sleep(delay);
      }
    }

    return message;
  }

  async duringConnection(): Promise<void> {
    if (!this.context || !this.shouldApplyChaos()) {
      return;
    }

    // Apply connection establishment delay
    if (this.config.processingDelayMs) {
      const [min, max] = this.config.processingDelayMs;
      const delay = this.random.nextInt(min, max * 2); // Double delay for connection
      if (delay > 0) {
        this.context.logger.debug(
          `Timing chaos: applying ${delay}ms connection delay`,
        );
        await this.sleep(delay);
      }
    }
  }

  async restore(): Promise<void> {
    if (this.context) {
      this.context.logger.debug('Timing chaos plugin restored', {
        clockSkewMs: this.clockSkew,
      });
    }
  }

  private shouldApplyChaos(): boolean {
    return this.random.nextBoolean(0.1); // 10% base chance
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private applyClockSkew(obj: any): any {
    if (this.clockSkew === 0) {
      return obj;
    }

    // Recursively find and modify timestamp fields
    const modified = JSON.parse(JSON.stringify(obj));
    this.modifyTimestamps(modified, this.clockSkew);
    return modified;
  }

  private modifyTimestamps(obj: any, skewMs: number): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (this.isTimestampField(key, value)) {
        // Modify timestamp
        if (typeof value === 'number') {
          obj[key] = value + skewMs;
        } else if (typeof value === 'string' && this.isISOTimestamp(value)) {
          const date = new Date(value);
          date.setTime(date.getTime() + skewMs);
          obj[key] = date.toISOString();
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        this.modifyTimestamps(value, skewMs);
      }
    }
  }

  private isTimestampField(key: string, value: any): boolean {
    const timestampKeys = [
      'timestamp',
      'time',
      'createdAt',
      'updatedAt',
      'startTime',
      'endTime',
      'created',
      'modified',
      'startedAt',
      'completedAt',
    ];

    const lowerKey = key.toLowerCase();
    return (
      timestampKeys.some((pattern) => lowerKey.includes(pattern)) &&
      (typeof value === 'number' ||
        (typeof value === 'string' && this.isISOTimestamp(value)))
    );
  }

  private isISOTimestamp(str: string): boolean {
    // Check if string looks like ISO timestamp
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    return isoRegex.test(str) && !isNaN(Date.parse(str));
  }

  /**
   * Get current clock skew for testing/debugging
   */
  getClockSkew(): number {
    return this.clockSkew;
  }

  /**
   * Get adjusted time (current time + skew)
   */
  getAdjustedTime(): number {
    return Date.now() + this.clockSkew;
  }

  /**
   * Simulate race condition by randomly yielding execution
   */
  async simulateRaceCondition(): Promise<void> {
    if (this.random.nextBoolean(0.1)) {
      // 10% chance
      await this.sleep(0); // Yield to event loop
    }
  }
}
