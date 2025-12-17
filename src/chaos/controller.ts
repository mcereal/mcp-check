/**
 * Main chaos controller implementation
 */

import {
  ChaosController,
  ChaosPlugin,
  ChaosConfig,
  ChaosContext,
  ChaosResult,
  PluginSendResult,
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

  async applySendChaos(message: any): Promise<ChaosResult> {
    if (!this.enabled || !this.context) {
      return { message };
    }

    let modifiedMessage = message;
    const allDuplicates: Array<{ message: any; delayMs: number }> = [];

    // Apply chaos from each enabled plugin
    for (const plugin of this.plugins) {
      if (plugin.enabled && plugin.beforeSend) {
        try {
          const result = await plugin.beforeSend(modifiedMessage);

          // Check if result is a PluginSendResult with duplicates
          if (this.isPluginSendResult(result)) {
            modifiedMessage = result.message;
            if (result.duplicates) {
              allDuplicates.push(...result.duplicates);
            }
          } else {
            modifiedMessage = result;
          }

          // If message was dropped, stop processing
          if (modifiedMessage === null) {
            break;
          }
        } catch (error) {
          this.context.logger.warn(
            `Chaos plugin ${plugin.name} failed on beforeSend`,
            { error },
          );
        }
      }
    }

    return {
      message: modifiedMessage,
      duplicates: allDuplicates.length > 0 ? allDuplicates : undefined,
    };
  }

  /**
   * Type guard to check if result is a PluginSendResult
   */
  private isPluginSendResult(result: any): result is PluginSendResult {
    return (
      result !== null &&
      typeof result === 'object' &&
      'message' in result &&
      (result.duplicates === undefined || Array.isArray(result.duplicates))
    );
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
