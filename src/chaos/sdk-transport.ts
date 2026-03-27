/**
 * Chaos-enhanced SDK transport wrapper.
 *
 * Wraps any MCP SDK Transport (StdioClientTransport, WebSocketClientTransport,
 * or TransportAdapter) with chaos injection. Intercepts send() and onmessage
 * to apply network delays, drops, corruption, and protocol-level faults.
 *
 * This is the key integration point that connects the chaos engine to actual
 * MCP communication — without this wrapper, chaos plugins have no effect.
 */

import { Transport as SDKTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ChaosController } from '../types/chaos';
import { Logger } from '../types/reporting';

export interface ChaosStats {
  messagesSent: number;
  messagesReceived: number;
  messagesDropped: number;
  messagesDelayed: number;
  messagesCorrupted: number;
  duplicatesSent: number;
}

export class ChaosSDKTransport implements SDKTransport {
  private _onmessage?: (message: any) => void;
  private _onerror?: (error: Error) => void;
  private _onclose?: () => void;
  private _stats: ChaosStats = {
    messagesSent: 0,
    messagesReceived: 0,
    messagesDropped: 0,
    messagesDelayed: 0,
    messagesCorrupted: 0,
    duplicatesSent: 0,
  };

  constructor(
    private readonly inner: SDKTransport,
    private readonly chaos: ChaosController,
    private readonly logger: Logger,
  ) {
    // Wire up the inner transport's callbacks to route through chaos
    this.inner.onerror = (error: Error) => {
      this._onerror?.(error);
    };

    this.inner.onclose = () => {
      this._onclose?.();
    };

    // Intercept incoming messages through the inner transport
    this.inner.onmessage = (message: any) => {
      this._stats.messagesReceived++;
      this.chaos
        .applyReceiveChaos(message)
        .then((modified) => {
          if (modified !== message) {
            this._stats.messagesCorrupted++;
            this.logger.debug('Chaos: modified incoming message');
          }
          this._onmessage?.(modified);
        })
        .catch((error) => {
          this.logger.debug('Chaos: error applying receive chaos', {
            error: error.message,
          });
          // Still deliver the original message on chaos error
          this._onmessage?.(message);
        });
    };
  }

  // SDK Transport callback properties — setters route through chaos
  set onmessage(handler: ((message: any) => void) | undefined) {
    this._onmessage = handler;
  }
  get onmessage() {
    return this._onmessage;
  }

  set onerror(handler: ((error: Error) => void) | undefined) {
    this._onerror = handler;
  }
  get onerror() {
    return this._onerror;
  }

  set onclose(handler: (() => void) | undefined) {
    this._onclose = handler;
  }
  get onclose() {
    return this._onclose;
  }

  async start(): Promise<void> {
    return this.inner.start();
  }

  async send(message: any): Promise<void> {
    this._stats.messagesSent++;

    try {
      const result = await this.chaos.applySendChaos(message);

      // Dropped message
      if (result.message === null) {
        this._stats.messagesDropped++;
        this.logger.debug('Chaos: dropped outgoing message');
        return;
      }

      // Check if message was modified (corrupted)
      if (result.message !== message) {
        this._stats.messagesCorrupted++;
      }

      // Send the (possibly modified) message
      await this.inner.send(result.message);

      // Schedule duplicates
      if (result.duplicates && result.duplicates.length > 0) {
        for (const dup of result.duplicates) {
          this._stats.duplicatesSent++;
          this._stats.messagesDelayed++;
          setTimeout(async () => {
            try {
              await this.inner.send(dup.message);
              this.logger.debug('Chaos: sent duplicate message', {
                delayMs: dup.delayMs,
              });
            } catch {
              // Ignore errors in duplicate sending
            }
          }, dup.delayMs);
        }
      }
    } catch (error: any) {
      this.logger.debug('Chaos: error during send', {
        error: error.message,
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    return this.inner.close();
  }

  /**
   * Get chaos statistics for this transport session.
   * Useful for including in test reports.
   */
  getChaosStats(): ChaosStats {
    return { ...this._stats };
  }

  /**
   * Check if any chaos was actually applied during this session.
   */
  get hadChaosEvents(): boolean {
    return (
      this._stats.messagesDropped > 0 ||
      this._stats.messagesCorrupted > 0 ||
      this._stats.duplicatesSent > 0 ||
      this._stats.messagesDelayed > 0
    );
  }
}
