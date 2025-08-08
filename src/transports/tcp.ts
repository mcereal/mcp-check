/**
 * TCP transport implementation
 */

import * as net from 'net';
import * as tls from 'tls';
import { Target } from '../types/config';
import { BaseTransport } from './base';

/**
 * TCP transport for network connections
 */
export class TcpTransport extends BaseTransport {
  readonly type = 'tcp' as const;

  private socket?: net.Socket;
  private buffer = '';

  async connect(target: Target): Promise<void> {
    if (target.type !== 'tcp') {
      throw new Error('Invalid target type for TCP transport');
    }

    this.setState('connecting');

    try {
      const connectionStart = Date.now();

      if (target.tls) {
        this.socket = tls.connect({
          host: target.host,
          port: target.port,
          timeout: target.timeout || 5000,
        });
      } else {
        this.socket = net.connect({
          host: target.host,
          port: target.port,
          timeout: target.timeout || 5000,
        });
      }

      this.setupSocketHandlers();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(`Connection timeout to ${target.host}:${target.port}`),
          );
        }, target.timeout || 5000);

        this.socket!.on('connect', () => {
          clearTimeout(timeout);
          this._stats.connectionTime = Date.now() - connectionStart;
          this.setState('connected');
          resolve();
        });

        this.socket!.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async send(message: any): Promise<void> {
    if (!this.socket || this.state !== 'connected') {
      throw new Error('Transport not connected');
    }

    const data = this.serializeMessage(message) + '\n';

    return new Promise((resolve, reject) => {
      this.socket!.write(data, 'utf-8', (error) => {
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
    if (this.socket) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          this.socket = undefined;
          this.handleClose();
          resolve();
        };

        this.socket.on('close', cleanup);
        this.socket.end();

        // Force close after timeout
        setTimeout(() => {
          if (this.socket) {
            this.socket.destroy();
            cleanup();
          }
        }, 3000);
      });
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    // Handle incoming data
    this.socket.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf-8');
      this.processBuffer();
    });

    // Handle socket errors
    this.socket.on('error', (error) => {
      this.handleError(error);
    });

    // Handle socket close
    this.socket.on('close', (hadError) => {
      if (hadError) {
        this.handleError(new Error('Socket closed due to error'));
      } else {
        this.handleClose();
      }
    });

    // Handle timeout
    this.socket.on('timeout', () => {
      this.handleError(new Error('Socket timeout'));
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep the last partial line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          const message = this.parseMessage(trimmed);
          this.onMessageReceived(trimmed);
          this.emit('message', message);
        } catch (error) {
          this.handleError(
            new Error(`Failed to parse message: ${error.message}`),
          );
        }
      }
    }
  }
}
