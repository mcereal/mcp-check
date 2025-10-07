/**
 * WebSocket transport implementation
 */

import WebSocket from 'ws';
import { Target } from '../types/config';
import { BaseTransport } from './base';

/**
 * WebSocket transport for web-based connections
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

      this.ws = new WebSocket(target.url, target.protocols, {
        headers: target.headers,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Normalise rejection so tests receive a consistent Error instance
          const timeoutError = new Error(
            `WebSocket connection timeout to ${target.url}`,
          );
          cleanup();
          reject(timeoutError);
        }, 10000);

        const handleOpen = () => {
          clearTimeout(timeout);
          this._stats.connectionTime = Date.now() - connectionStart;
          this.setState('connected');
          cleanup();
          resolve();
        };

        const handleError = (error: Error) => {
          clearTimeout(timeout);
          cleanup();
          this.handleError(error);
          reject(error);
        };

        const cleanup = () => {
          if (!this.ws) return;
          this.ws.off('open', handleOpen as any);
          this.ws.off('error', handleError as any);
        };

        this.ws.on('open', handleOpen as any);
        this.ws.on('error', handleError as any);
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

    return new Promise((resolve, reject) => {
      this.ws!.send(data, (error) => {
        if (error) {
          reject(error);
        } else {
          this.onMessageSent(data);
          resolve();
        }
      });
    });
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
          this.ws.on('close', cleanup);
          this.ws.close();

          // Force close after timeout
          setTimeout(() => {
            if (this.ws) {
              this.ws.terminate();
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
    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const text = data.toString('utf-8');
        const message = this.parseMessage(text);
        this.onMessageReceived(text);
        this.emit('message', message);
      } catch (error) {
        this.handleError(
          new Error(`Failed to parse WebSocket message: ${error.message}`),
        );
      }
    });

    // Handle WebSocket errors
    this.ws.on('error', (error) => {
      this.handleError(error);
    });

    // Handle WebSocket close
    this.ws.on('close', (code, reason) => {
      if (code !== 1000) {
        // 1000 = normal closure
        this.handleError(
          new Error(`WebSocket closed with code ${code}: ${reason}`),
        );
      } else {
        this.handleClose();
      }
    });

    // Handle ping/pong for keep-alive
    this.ws.on('ping', (data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.pong(data);
      }
    });
  }
}
