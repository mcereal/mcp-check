/**
 * Chaos-enhanced transport wrapper
 */

import {
  Transport,
  ConnectionState,
  TransportStats,
  TransportEvents,
} from '../types/transport';
import { Target } from '../types/config';
import { ChaosController } from '../types/chaos';
import { Logger } from '../types/reporting';

/**
 * Transport wrapper that applies chaos engineering
 */
export class ChaosTransport implements Transport {
  private transport: Transport;
  private chaosController: ChaosController;
  private logger: Logger;

  constructor(
    transport: Transport,
    chaosController: ChaosController,
    logger: Logger,
  ) {
    this.transport = transport;
    this.chaosController = chaosController;
    this.logger = logger;
  }

  get type(): 'stdio' | 'tcp' | 'websocket' {
    return this.transport.type;
  }

  get state(): ConnectionState {
    return this.transport.state;
  }

  get stats(): TransportStats {
    return this.transport.stats;
  }

  async connect(target: Target): Promise<void> {
    // Apply connection-level chaos
    for (const plugin of this.chaosController.plugins) {
      if (plugin.enabled && plugin.duringConnection) {
        try {
          await plugin.duringConnection();
        } catch (error) {
          this.logger.warn(
            `Chaos plugin ${plugin.name} failed during connection`,
            { error },
          );
        }
      }
    }

    return this.transport.connect(target);
  }

  async close(): Promise<void> {
    return this.transport.close();
  }

  async send(message: any): Promise<void> {
    try {
      // Apply send chaos
      const modifiedMessage =
        await this.chaosController.applySendChaos(message);

      // If chaos returns null, simulate dropped message
      if (modifiedMessage === null) {
        this.logger.debug('Chaos: message dropped, not sending');
        return;
      }

      return this.transport.send(modifiedMessage);
    } catch (error) {
      // Chaos might inject errors
      this.logger.debug('Chaos: error during send', { error });
      throw error;
    }
  }

  async waitForMessage(
    predicate: (message: any) => boolean,
    timeoutMs?: number,
  ): Promise<any> {
    // For now, delegate directly to the underlying transport
    // In a more sophisticated implementation, we could apply chaos to the received messages
    return this.transport.waitForMessage(predicate, timeoutMs);
  }

  on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): void {
    return this.transport.on(event, listener);
  }

  off<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): void {
    return this.transport.off(event, listener);
  }

  /**
   * Get the underlying transport (for testing/debugging)
   */
  getUnderlyingTransport(): Transport {
    return this.transport;
  }

  /**
   * Get the chaos controller (for testing/debugging)
   */
  getChaosController(): ChaosController {
    return this.chaosController;
  }
}
