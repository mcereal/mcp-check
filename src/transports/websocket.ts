/**
 * WebSocket transport implementation using native Node.js WebSocket
 */

import { Target } from '../types/config';
import { BaseTransport } from './base';

/**
 * WebSocket transport for web-based connections
 * Uses native Node.js WebSocket (available in Node 22+)
 */
export class WebSocketTransport extends BaseTransport {
  readonly type = 'websocket' as const;

  private ws?: WebSocket;

  async connect(target: Target): Promise<void> {
    if (target.type !== 'websocket') {
      throw new Error('Invalid target type for WebSocket transport');
    }

    this.setState('connecting');

    try {
      const connectionStart = Date.now();

      // Native WebSocket doesn't support custom headers directly
      // For most MCP use cases, this shouldn't be an issue
      // If headers are needed, they'd need to be passed via query params or subprotocols
      this.ws = new WebSocket(target.url, target.protocols);

      const connectionTimeout = target.timeout ?? 10000;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const timeoutError = new Error(
            `WebSocket connection timeout to ${target.url}`,
          );
          cleanup();
          reject(timeoutError);
        }, connectionTimeout);

        const handleOpen = (): void => {
          clearTimeout(timeout);
          this._stats.connectionTime = Date.now() - connectionStart;
          this.setState('connected');
          cleanup();
          resolve();
        };

        const handleError = (event: Event): void => {
          clearTimeout(timeout);
          cleanup();
          const error = new Error('WebSocket connection failed');
          this.handleError(error);
          reject(error);
        };

        const cleanup = (): void => {
          if (!this.ws) return;
          this.ws.removeEventListener('open', handleOpen);
          this.ws.removeEventListener('error', handleError);
        };

        this.ws.addEventListener('open', handleOpen);
        this.ws.addEventListener('error', handleError);
      });

      this.setupWebSocketHandlers();
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async send(message: any): Promise<void> {
    if (!this.ws || this.state !== 'connected') {
      throw new Error('Transport not connected');
    }

    const data = this.serializeMessage(message);

    // Native WebSocket send is synchronous and doesn't have a callback
    // It throws if the connection is not open
    try {
      this.ws.send(data);
      this.onMessageSent(data);
    } catch (error) {
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.ws) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          this.ws = undefined;
          this.handleClose();
          resolve();
        };

        if (this.ws.readyState === WebSocket.OPEN) {
          const closeHandler = () => {
            cleanup();
          };
          this.ws.addEventListener('close', closeHandler, { once: true });
          this.ws.close(1000, 'Normal closure');

          // Force cleanup after timeout since native WebSocket has no terminate()
          setTimeout(() => {
            if (this.ws) {
              cleanup();
            }
          }, 3000);
        } else {
          cleanup();
        }
      });
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    // Handle incoming messages
    this.ws.addEventListener('message', (event: MessageEvent) => {
      try {
        // Native WebSocket can return string or Blob
        // For JSON-RPC, we expect string data
        const text = typeof event.data === 'string'
          ? event.data
          : String(event.data);
        const message = this.parseMessage(text);
        this.onMessageReceived(text);
        this.emit('message', message);
      } catch (error) {
        this.handleError(
          new Error(`Failed to parse WebSocket message: ${(error as Error).message}`),
        );
      }
    });

    // Handle WebSocket errors
    this.ws.addEventListener('error', () => {
      this.handleError(new Error('WebSocket error'));
    });

    // Handle WebSocket close
    this.ws.addEventListener('close', (event: CloseEvent) => {
      if (event.code !== 1000) {
        // 1000 = normal closure
        this.handleError(
          new Error(`WebSocket closed with code ${event.code}: ${event.reason}`),
        );
      } else {
        this.handleClose();
      }
    });

    // Note: Native WebSocket handles ping/pong automatically at the protocol level
    // No manual ping/pong handling needed
  }
}
