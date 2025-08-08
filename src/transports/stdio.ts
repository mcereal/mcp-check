/**
 * Standard I/O (stdio) transport implementation
 */

import { spawn, ChildProcess } from 'child_process';
import { Target } from '../types/config';
import { BaseTransport } from './base';

/**
 * Stdio transport for communicating with child processes
 */
export class StdioTransport extends BaseTransport {
  readonly type = 'stdio' as const;

  private process?: ChildProcess;
  private buffer = '';

  async connect(target: Target): Promise<void> {
    if (target.type !== 'stdio') {
      throw new Error('Invalid target type for stdio transport');
    }

    this.setState('connecting');

    try {
      this.process = spawn(target.command, target.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...target.env },
        cwd: target.cwd,
        shell: target.shell || false,
      });

      this.setupProcessHandlers();

      // Wait for process to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Process startup timeout'));
        }, 5000);

        this.process!.on('spawn', () => {
          clearTimeout(timeout);
          this._stats.connectionTime = Date.now();
          this.setState('connected');
          resolve();
        });

        this.process!.on('error', (error) => {
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
    if (!this.process || this.state !== 'connected') {
      throw new Error('Transport not connected');
    }

    const data = this.serializeMessage(message) + '\n';

    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(data, 'utf-8', (error) => {
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
    if (this.process) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          this.process = undefined;
          this.handleClose();
          resolve();
        };

        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        const timeout = setTimeout(() => {
          // Force kill if graceful shutdown fails
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          cleanup();
        }, 3000);

        this.process.on('exit', () => {
          clearTimeout(timeout);
          cleanup();
        });
      });
    }
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle stdout data (JSON-RPC messages)
    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf-8');
      this.processBuffer();
    });

    // Handle stderr for debugging
    this.process.stderr!.on('data', (data: Buffer) => {
      const text = data.toString('utf-8').trim();
      if (text) {
        // Emit as debug info, not an error
        this.emit('debug', text);
      }
    });

    // Handle process errors
    this.process.on('error', (error) => {
      this.handleError(error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        this.handleError(new Error(`Process exited with code ${code}`));
      } else if (signal) {
        this.handleError(new Error(`Process terminated with signal ${signal}`));
      } else {
        this.handleClose();
      }
    });

    // Handle disconnection
    this.process.on('disconnect', () => {
      this.handleClose();
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
