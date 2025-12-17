/**
 * Network chaos plugin - simulates network-level disruptions
 */

import {
  ChaosPlugin,
  ChaosContext,
  NetworkChaosConfig,
  PluginSendResult,
} from '../types/chaos';
import { MCPPseudoRandom } from './random';

/**
 * Simulates network-level chaos like latency, packet loss, etc.
 */
export class NetworkChaosPlugin implements ChaosPlugin {
  readonly name = 'network-chaos';
  readonly description =
    'Simulates network latency, packet loss, and connection issues';
  enabled = true;

  private config: NetworkChaosConfig;
  private context?: ChaosContext;
  private random: MCPPseudoRandom;

  constructor(config: NetworkChaosConfig = {}) {
    this.config = {
      delayMs: [0, 100],
      dropProbability: 0.01,
      duplicateProbability: 0.005,
      reorderProbability: 0.005,
      corruptProbability: 0.001,
      ...config,
    };
    this.random = new MCPPseudoRandom();
  }

  async initialize(context: ChaosContext): Promise<void> {
    this.context = context;
    this.random = new MCPPseudoRandom(context.seed);

    context.logger.debug('Network chaos plugin initialized', {
      config: this.config,
    });
  }

  async beforeSend(message: any): Promise<PluginSendResult> {
    if (!this.context || !this.shouldApplyChaos()) {
      return { message };
    }

    const duplicates: Array<{ message: any; delayMs: number }> = [];
    let modifiedMessage = message;

    // Simulate network delay
    if (this.config.delayMs) {
      const [min, max] = this.config.delayMs;
      const delay = this.random.nextInt(min, max);
      if (delay > 0) {
        this.context.logger.debug(`Network chaos: injecting ${delay}ms delay`);
        await this.sleep(delay);
      }
    }

    // Simulate packet drop (return null to drop message)
    if (
      this.config.dropProbability &&
      this.random.nextBoolean(this.config.dropProbability)
    ) {
      this.context.logger.debug('Network chaos: dropping outgoing message');
      throw new Error('Network chaos: simulated packet drop');
    }

    // Simulate message duplication
    if (
      this.config.duplicateProbability &&
      this.random.nextBoolean(this.config.duplicateProbability)
    ) {
      const duplicateDelay = this.random.nextInt(10, 100);
      this.context.logger.debug(
        `Network chaos: scheduling duplicate message with ${duplicateDelay}ms delay`,
      );
      // Clone the message to avoid reference issues
      const duplicateMessage = JSON.parse(JSON.stringify(message));
      duplicates.push({ message: duplicateMessage, delayMs: duplicateDelay });
    }

    // Simulate message corruption
    if (
      this.config.corruptProbability &&
      this.random.nextBoolean(this.config.corruptProbability)
    ) {
      this.context.logger.debug('Network chaos: corrupting message');
      modifiedMessage = this.corruptMessage(modifiedMessage);
    }

    return {
      message: modifiedMessage,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
    };
  }

  async afterReceive(message: any): Promise<any> {
    if (!this.context || !this.shouldApplyChaos()) {
      return message;
    }

    // Simulate receive delay
    if (this.config.delayMs) {
      const [min, max] = this.config.delayMs;
      const delay = this.random.nextInt(min, max);
      if (delay > 0) {
        this.context.logger.debug(
          `Network chaos: injecting ${delay}ms receive delay`,
        );
        await this.sleep(delay);
      }
    }

    // Simulate message corruption on receive
    if (
      this.config.corruptProbability &&
      this.random.nextBoolean(this.config.corruptProbability)
    ) {
      this.context.logger.debug('Network chaos: corrupting received message');
      return this.corruptMessage(message);
    }

    return message;
  }

  async restore(): Promise<void> {
    if (this.context) {
      this.context.logger.debug('Network chaos plugin restored');
    }
  }

  private shouldApplyChaos(): boolean {
    // Apply chaos based on controller's intensity
    return this.random.nextBoolean(0.1); // 10% base chance
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private corruptMessage(message: any): any {
    // Choose a corruption strategy
    const strategies = [
      () => this.corruptByteLevel(message),
      () => this.corruptStructure(message),
      () => this.corruptValues(message),
      () => this.partiallyTruncate(message),
    ];

    const strategy = strategies[this.random.nextInt(0, strategies.length)];
    try {
      return strategy();
    } catch (error) {
      return message;
    }
  }

  private corruptByteLevel(message: any): string {
    // Convert to JSON string and corrupt at byte level
    const jsonStr = typeof message === 'string' ? message : JSON.stringify(message);
    const chars = jsonStr.split('');

    if (chars.length === 0) return jsonStr;

    // Corrupt 1-3 random positions
    const corruptCount = this.random.nextInt(1, Math.min(4, chars.length));
    for (let i = 0; i < corruptCount; i++) {
      const index = this.random.nextInt(0, chars.length);
      const corruptionTypes = [
        // Replace with random ASCII
        () => String.fromCharCode(this.random.nextInt(0, 128)),
        // Replace with random high byte
        () => String.fromCharCode(this.random.nextInt(128, 256)),
        // Insert null byte
        () => '\x00',
        // Insert control character
        () => String.fromCharCode(this.random.nextInt(1, 32)),
        // Delete the character
        () => '',
        // Double the character
        () => chars[index] + chars[index],
      ];
      const corruptionType = corruptionTypes[this.random.nextInt(0, corruptionTypes.length)];
      chars[index] = corruptionType();
    }

    return chars.join('');
  }

  private corruptStructure(message: any): any {
    if (typeof message !== 'object' || message === null) {
      return message;
    }

    const corrupted = JSON.parse(JSON.stringify(message));
    const keys = Object.keys(corrupted);

    if (keys.length === 0) return corrupted;

    // Choose a structural corruption
    const structuralCorruptions = [
      // Delete a random key
      () => {
        const key = keys[this.random.nextInt(0, keys.length)];
        delete corrupted[key];
        return corrupted;
      },
      // Rename a key to corrupted name
      () => {
        const key = keys[this.random.nextInt(0, keys.length)];
        const value = corrupted[key];
        delete corrupted[key];
        corrupted[key + '\x00corrupted'] = value;
        return corrupted;
      },
      // Swap two values
      () => {
        if (keys.length >= 2) {
          const key1 = keys[this.random.nextInt(0, keys.length)];
          const key2 = keys[this.random.nextInt(0, keys.length)];
          const temp = corrupted[key1];
          corrupted[key1] = corrupted[key2];
          corrupted[key2] = temp;
        }
        return corrupted;
      },
      // Nest the message incorrectly
      () => {
        const key = keys[this.random.nextInt(0, keys.length)];
        corrupted[key] = { wrapped: corrupted[key], corrupted: true };
        return corrupted;
      },
    ];

    return structuralCorruptions[this.random.nextInt(0, structuralCorruptions.length)]();
  }

  private corruptValues(message: any): any {
    if (typeof message !== 'object' || message === null) {
      return message;
    }

    const corrupted = JSON.parse(JSON.stringify(message));
    const keys = Object.keys(corrupted);

    if (keys.length === 0) return corrupted;

    const key = keys[this.random.nextInt(0, keys.length)];
    const currentValue = corrupted[key];

    // Type-changing corruptions
    const valueCorruptions: Record<string, () => any> = {
      string: () => {
        const strategies = [
          // Truncate
          () => currentValue.substring(0, Math.max(0, currentValue.length - this.random.nextInt(1, 5))),
          // Insert garbage
          () => currentValue.slice(0, 2) + '\x00\x01\x02' + currentValue.slice(2),
          // Change case and add symbols
          () => currentValue.toUpperCase() + '!@#$%',
          // Empty it
          () => '',
        ];
        return strategies[this.random.nextInt(0, strategies.length)]();
      },
      number: () => {
        const strategies = [
          // Flip sign
          () => -currentValue,
          // Make huge
          () => currentValue * 1e15,
          // Make tiny
          () => currentValue * 1e-15,
          // Change to non-finite (will become null in JSON)
          () => NaN,
        ];
        return strategies[this.random.nextInt(0, strategies.length)]();
      },
      boolean: () => !currentValue,
      object: () => currentValue === null ? {} : null,
    };

    const valueType = typeof currentValue;
    if (valueCorruptions[valueType]) {
      corrupted[key] = valueCorruptions[valueType]();
    } else {
      // Replace with wrong type
      corrupted[key] = { corrupted: true, originalType: valueType };
    }

    return corrupted;
  }

  private partiallyTruncate(message: any): string {
    // Return truncated JSON that may or may not be parseable
    const jsonStr = typeof message === 'string' ? message : JSON.stringify(message);
    const truncatePoint = this.random.nextInt(
      Math.floor(jsonStr.length * 0.5),
      Math.floor(jsonStr.length * 0.9),
    );
    return jsonStr.substring(0, truncatePoint);
  }
}
