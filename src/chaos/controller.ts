/**
 * Main chaos controller implementation
 */

import {
  ChaosController,
  ChaosPlugin,
  ChaosConfig,
  ChaosContext,
  PseudoRandom,
} from '../types/chaos';
import { Transport } from '../types/transport';
import { Logger } from '../types/reporting';
import { MCPPseudoRandom } from './random';

/**
 * Default chaos controller implementation
 */
export class DefaultChaosController implements ChaosController {
  public readonly config: ChaosConfig;
  public readonly plugins: ChaosPlugin[] = [];

  private context?: ChaosContext;
  private random: PseudoRandom;
  private enabled = false;

  constructor(config: ChaosConfig) {
    this.config = {
      enable: false,
      seed: Date.now(),
      intensity: 0.1,
      ...config,
    };

    this.random = new MCPPseudoRandom(this.config.seed);
  }

  async initialize(context: ChaosContext): Promise<void> {
    this.context = context;

    context.logger.debug('Initializing chaos controller', {
      seed: this.config.seed,
      intensity: this.config.intensity,
      pluginCount: this.plugins.length,
    });

    // Initialize all plugins
    for (const plugin of this.plugins) {
      if (plugin.enabled) {
        try {
          await plugin.initialize(context);
          context.logger.debug(`Initialized chaos plugin: ${plugin.name}`);
        } catch (error) {
          context.logger.warn(
            `Failed to initialize chaos plugin ${plugin.name}`,
            { error },
          );
        }
      }
    }

    if (this.config.enable) {
      this.enable();
    }
  }

  register(plugin: ChaosPlugin): void {
    this.plugins.push(plugin);
  }

  enable(): void {
    this.enabled = true;
    if (this.context) {
      this.context.logger.info('Chaos engineering enabled', {
        seed: this.config.seed,
        intensity: this.config.intensity,
      });
    }
  }

  disable(): void {
    this.enabled = false;
    if (this.context) {
      this.context.logger.info('Chaos engineering disabled');
    }
  }

  async applySendChaos(message: any): Promise<any> {
    if (!this.enabled || !this.context) {
      return message;
    }

    let modifiedMessage = message;

    // Apply chaos from each enabled plugin
    for (const plugin of this.plugins) {
      if (plugin.enabled && plugin.beforeSend) {
        try {
          modifiedMessage = await plugin.beforeSend(modifiedMessage);
        } catch (error) {
          this.context.logger.warn(
            `Chaos plugin ${plugin.name} failed on beforeSend`,
            { error },
          );
        }
      }
    }

    return modifiedMessage;
  }

  async applyReceiveChaos(message: any): Promise<any> {
    if (!this.enabled || !this.context) {
      return message;
    }

    let modifiedMessage = message;

    // Apply chaos from each enabled plugin
    for (const plugin of this.plugins) {
      if (plugin.enabled && plugin.afterReceive) {
        try {
          modifiedMessage = await plugin.afterReceive(modifiedMessage);
        } catch (error) {
          this.context.logger.warn(
            `Chaos plugin ${plugin.name} failed on afterReceive`,
            { error },
          );
        }
      }
    }

    return modifiedMessage;
  }

  async restore(): Promise<void> {
    if (!this.context) {
      return;
    }

    this.context.logger.info('Restoring normal operation from chaos mode');

    // Restore all plugins
    const promises = this.plugins.map(async (plugin) => {
      try {
        await plugin.restore();
      } catch (error) {
        this.context!.logger.warn(
          `Failed to restore chaos plugin ${plugin.name}`,
          { error },
        );
      }
    });

    await Promise.all(promises);
    this.enabled = false;
  }

  /**
   * Get the random number generator for plugins to use
   */
  getRandom(): PseudoRandom {
    return this.random;
  }

  /**
   * Check if chaos should be applied based on intensity
   */
  shouldApplyChaos(): boolean {
    if (!this.enabled) {
      return false;
    }
    return this.random.nextBoolean(this.config.intensity || 0.1);
  }
}
