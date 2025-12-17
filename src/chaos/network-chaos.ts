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
    if (typeof message === 'string') {
      // Corrupt random character in string
      const chars = message.split('');
      if (chars.length > 0) {
        const index = this.random.nextInt(0, chars.length);
        chars[index] = String.fromCharCode(this.random.nextInt(32, 127));
        return chars.join('');
      }
    } else if (typeof message === 'object' && message !== null) {
      // Corrupt object by modifying a random field
      const corrupted = JSON.parse(JSON.stringify(message));
      const keys = Object.keys(corrupted);
      if (keys.length > 0) {
        const key = keys[this.random.nextInt(0, keys.length)];
        if (typeof corrupted[key] === 'string') {
          corrupted[key] = corrupted[key] + '_CORRUPTED';
        } else if (typeof corrupted[key] === 'number') {
          corrupted[key] = corrupted[key] + this.random.nextInt(-100, 100);
        }
      }
      return corrupted;
    }

    return message;
  }
}
