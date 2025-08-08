/**
 * Unit tests for StdioTransport
 */

import { StdioTransport } from '../../../src/transports/stdio';
import { Target } from '../../../src/types/config';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

// Mock child_process
jest.mock('child_process');

describe('StdioTransport', () => {
  let transport: StdioTransport;
  let mockProcess: Partial<ChildProcess>;

  beforeEach(() => {
    transport = new StdioTransport();
    mockProcess = {
      stdin: {
        write: jest.fn((data, encoding, callback) => {
          if (callback) callback();
          return true;
        }),
      } as any,
      stdout: Object.assign(new EventEmitter(), {
        on: jest.fn(function (event, handler) {
          EventEmitter.prototype.on.call(this, event, handler);
          return this;
        }),
      }) as any,
      stderr: Object.assign(new EventEmitter(), {
        on: jest.fn(function (event, handler) {
          EventEmitter.prototype.on.call(this, event, handler);
          return this;
        }),
      }) as any,
      kill: jest.fn(),
      on: jest.fn(),
      pid: 12345,
    };

    // Mock spawn to return our mock process
    const spawn = require('child_process').spawn;
    spawn.mockReturnValue(mockProcess);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct type', () => {
      expect(transport.type).toBe('stdio');
      expect(transport.state).toBe('disconnected');
    });
  });

  describe('Connection', () => {
    it('should connect to a stdio target successfully', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { DEBUG: '1' },
        cwd: '/test',
      };

      // Set up process to emit spawn event
      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();
      }, 10);

      await transport.connect(target);

      expect(transport.state).toBe('connected');
      expect(require('child_process').spawn).toHaveBeenCalledWith(
        'node',
        ['server.js'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, DEBUG: '1' },
          cwd: '/test',
          shell: false,
        },
      );
    });

    it('should reject invalid target type', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      await expect(transport.connect(target)).rejects.toThrow(
        'Invalid target type for stdio transport',
      );
    });

    it('should handle process spawn errors', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['--invalid-flag'],
      };

      // Mock spawn to return process that emits error immediately
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).stdin = new EventEmitter();
      (mockProcess as any).stdout = new EventEmitter();
      (mockProcess as any).stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      const spawn = require('child_process').spawn as jest.Mock;
      spawn.mockReturnValue(mockProcess);

      // Attach error handler to prevent unhandled rejection
      transport.on('error', () => {});

      // Set up process to emit error before timeout
      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockProcess.emit('error', new Error('Process spawn failed'));
      }, 10);

      await expect(connectPromise).rejects.toThrow('Process spawn failed');
    });

    it('should timeout on process startup', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'slow-process',
        args: [],
      };

      // Don't emit spawn event to trigger timeout
      await expect(transport.connect(target)).rejects.toThrow(
        'Process startup timeout',
      );
    }, 6000);
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      // Set up successful connection
      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();
      }, 10);

      await transport.connect(target);
    });

    it('should send messages correctly', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await transport.send(message);

      expect(mockProcess.stdin!.write).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
        'utf-8',
        expect.any(Function),
      );
    });

    it('should reject sending when not connected', async () => {
      const disconnectedTransport = new StdioTransport();
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await expect(disconnectedTransport.send(message)).rejects.toThrow(
        'Transport not connected',
      );
    });

    it('should handle write errors', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      // Mock write to call callback with error
      (mockProcess.stdin!.write as jest.Mock).mockImplementation(
        (data, encoding, callback) => {
          if (callback) callback(new Error('Write failed'));
          return false;
        },
      );

      await expect(transport.send(message)).rejects.toThrow('Write failed');
    });
  });

  describe('Message Reception', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();
      }, 10);

      await transport.connect(target);
    });

    it('should parse complete JSON messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message) + '\n';

      // Simulate data from stdout
      const dataCallback = (
        mockProcess.stdout!.on as jest.Mock
      ).mock.calls.find((call) => call[0] === 'data')?.[1];

      if (dataCallback) {
        dataCallback(Buffer.from(data));
      }

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should buffer incomplete messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message) + '\n';

      // Send message in chunks
      const dataCallback = (
        mockProcess.stdout!.on as jest.Mock
      ).mock.calls.find((call) => call[0] === 'data')?.[1];

      if (dataCallback) {
        dataCallback(Buffer.from(data.slice(0, 10)));
        dataCallback(Buffer.from(data.slice(10)));
      }

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle malformed JSON gracefully', () => {
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      transport.on('message', messageHandler);
      transport.on('error', errorHandler);

      const dataCallback = (
        mockProcess.stdout!.on as jest.Mock
      ).mock.calls.find((call) => call[0] === 'data')?.[1];

      if (dataCallback) {
        dataCallback(Buffer.from('{ invalid json }\n'));
      }

      expect(messageHandler).not.toHaveBeenCalled();
      // Should handle gracefully without crashing
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();
      }, 10);

      await transport.connect(target);
    });

    it('should close gracefully', async () => {
      const closePromise = transport.close();

      // Simulate process exit
      setTimeout(() => {
        const exitCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'exit',
        )?.[1];
        if (exitCallback) exitCallback(0, null);
      }, 10);

      await closePromise;

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(transport.state).toBe('disconnected');
    });

    it('should force kill if graceful shutdown fails', async () => {
      const closePromise = transport.close();

      // Don't simulate process exit to trigger force kill
      await closePromise;

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    }, 4000);
  });

  describe('Error Handling', () => {
    it('should handle process errors', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();

        // Simulate process error after connection
        const errorCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'error',
        )?.[1];
        if (errorCallback) errorCallback(new Error('Process error'));
      }, 10);

      await transport.connect(target);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Process error',
        }),
      );
    });

    it('should handle process exit with error code', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();

        // Simulate process exit with error code
        const exitCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'exit',
        )?.[1];
        if (exitCallback) exitCallback(1, null);
      }, 10);

      await transport.connect(target);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Process exited with code 1',
        }),
      );
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      };

      setTimeout(() => {
        const spawnCallback = (mockProcess.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'spawn',
        )?.[1];
        if (spawnCallback) spawnCallback();
      }, 10);

      await transport.connect(target);
    });

    it('should track message statistics', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await transport.send(message);

      const stats = transport.stats;
      expect(stats.messagesSent).toBe(1);
      expect(stats.bytesTransferred).toBeGreaterThan(0);
    });
  });
});
