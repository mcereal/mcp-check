/**
 * Base transport implementation with common functionality
 */

import { EventEmitter } from 'events';
import {
  Transport,
  TransportEvents,
  TransportStats,
  ConnectionState,
} from '../types/transport';
import { Target } from '../types/config';

/**
 * Base transport class with common functionality
 */
export abstract class BaseTransport extends EventEmitter implements Transport {
  abstract readonly type: 'stdio' | 'tcp' | 'websocket';

  protected _state: ConnectionState = 'disconnected';
  protected _stats: TransportStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesTransferred: 0,
  };

  get state(): ConnectionState {
    return this._state;
  }

  get stats(): TransportStats {
    return { ...this._stats };
  }

  abstract connect(target: Target): Promise<void>;
  abstract send(message: any): Promise<void>;
  abstract close(): Promise<void>;

  /**
   * Wait for a specific message or timeout
   */
  async waitForMessage(
    predicate: (message: any) => boolean,
    timeoutMs: number = 5000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('message', messageHandler);
        reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);

      const messageHandler = (message: any) => {
        if (predicate(message)) {
          clearTimeout(timeout);
          this.off('message', messageHandler);
          resolve(message);
        }
      };

      this.on('message', messageHandler);
    });
  }

  /**
   * Update connection state and emit event
   */
  protected setState(state: ConnectionState): void {
    if (this._state !== state) {
      this._state = state;
      this.emit('state-change', state);
    }
  }

  /**
   * Update stats when sending a message
   */
  protected onMessageSent(data: string | Buffer): void {
    this._stats.messagesSent++;
    this._stats.bytesTransferred += Buffer.isBuffer(data)
      ? data.length
      : Buffer.byteLength(data);
    this._stats.lastMessageTime = Date.now();
  }

  /**
   * Update stats when receiving a message
   */
  protected onMessageReceived(data: string | Buffer): void {
    this._stats.messagesReceived++;
    this._stats.bytesTransferred += Buffer.isBuffer(data)
      ? data.length
      : Buffer.byteLength(data);
    this._stats.lastMessageTime = Date.now();
  }

  /**
   * Parse JSON-RPC message from raw data
   */
  protected parseMessage(data: string | Buffer): any {
    try {
      const text = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Failed to parse JSON message: ${error.message}`);
    }
  }

  /**
   * Serialize message to JSON-RPC format
   */
  protected serializeMessage(message: any): string {
    try {
      return JSON.stringify(message);
    } catch (error) {
      throw new Error(`Failed to serialize message: ${error.message}`);
    }
  }

  /**
   * Handle transport errors
   */
  protected handleError(error: Error): void {
    this.setState('error');
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    } else {
      // Preserve node semantics without crashing tests when no listener is attached
       
      console.error('Unhandled transport error', {
        transport: this.type,
        message: error.message,
      });
    }
  }

  /**
   * Handle transport closure
   */
  protected handleClose(): void {
    this.setState('disconnected');
    this.emit('close');
  }
}
