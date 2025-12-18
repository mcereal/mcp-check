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
 * Options for connection retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

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
  protected _lastError?: Error;
  protected _connectionAttempts = 0;

  get state(): ConnectionState {
    return this._state;
  }

  get stats(): TransportStats {
    return { ...this._stats };
  }

  /** Get the last error that occurred on this transport */
  get lastError(): Error | undefined {
    return this._lastError;
  }

  /** Get the number of connection attempts made */
  get connectionAttempts(): number {
    return this._connectionAttempts;
  }

  abstract connect(target: Target): Promise<void>;
  abstract send(message: any): Promise<void>;
  abstract close(): Promise<void>;

  /**
   * Connect with automatic retry on failure
   * Subclasses should implement doConnect() for the actual connection logic
   */
  async connectWithRetry(
    target: Target,
    options: RetryOptions = {},
  ): Promise<void> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let delay = opts.initialDelayMs;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      this._connectionAttempts = attempt + 1;

      try {
        await this.connect(target);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        this._lastError = lastError;

        if (attempt < opts.maxRetries) {
          // Wait before retrying with exponential backoff
          await this.sleep(delay);
          delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
        }
      }
    }

    throw new Error(
      `Failed to connect after ${opts.maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  /** Sleep helper for retry delays */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
   * Tracks the error and emits it if listeners are attached.
   * The error is always tracked in lastError for later inspection.
   */
  protected handleError(error: Error): void {
    this._lastError = error;
    this.setState('error');
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    }
    // Error is tracked in _lastError even if no listener - can be retrieved via lastError getter
  }

  /**
   * Reset transport state for reconnection
   */
  protected resetState(): void {
    this._state = 'disconnected';
    this._stats = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
    };
    this._lastError = undefined;
    this._connectionAttempts = 0;
  }

  /**
   * Handle transport closure
   */
  protected handleClose(): void {
    this.setState('disconnected');
    this.emit('close');
  }
}
