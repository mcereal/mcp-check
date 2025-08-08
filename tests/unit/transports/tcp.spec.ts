/**
 * Unit tests for TcpTransport
 */

import { TcpTransport } from '../../../src/transports/tcp';
import { Target } from '../../../src/types/config';
import { Socket } from 'net';
import { EventEmitter } from 'events';

// Mock net module
jest.mock('net');

describe('TcpTransport', () => {
  let transport: TcpTransport;
  let mockSocket: Partial<Socket> & EventEmitter;

  beforeEach(() => {
    transport = new TcpTransport();
    mockSocket = new EventEmitter() as Partial<Socket> & EventEmitter;

    // Add socket methods
    mockSocket.connect = jest.fn().mockReturnValue(mockSocket);
    mockSocket.write = jest
      .fn()
      .mockImplementation((data: any, encoding?: any, callback?: any) => {
        const cb = typeof encoding === 'function' ? encoding : callback;
        if (cb) setTimeout(cb, 0);
        return true;
      });
    mockSocket.end = jest.fn();
    mockSocket.destroy = jest.fn();
    mockSocket.setEncoding = jest.fn();
    mockSocket.setTimeout = jest.fn();

    // Mock Socket constructor
    const net = require('net');
    net.Socket.mockImplementation(() => mockSocket);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct type', () => {
      expect(transport.type).toBe('tcp');
      expect(transport.state).toBe('disconnected');
    });
  });

  describe('Connection', () => {
    it('should connect to TCP target successfully', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      const connectPromise = transport.connect(target);

      // Simulate successful connection
      setTimeout(() => {
        mockSocket.emit('connect');
      }, 20);

      await connectPromise;

      expect(transport.state).toBe('connected');
      expect(mockSocket.connect).toHaveBeenCalledWith(
        { host: 'localhost', port: 8080 },
        expect.any(Function),
      );
    });

    it('should connect with TLS when specified', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'example.com',
        port: 443,
        tls: true,
      };

      // Mock tls.connect for TLS connections
      const tls = require('tls');
      tls.connect = jest.fn((options, callback) => {
        if (callback) setTimeout(callback, 10);
        return mockSocket;
      });

      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockSocket.emit('secureConnect');
      }, 20);

      await connectPromise;

      expect(transport.state).toBe('connected');
      expect(tls.connect).toHaveBeenCalledWith(
        { host: 'example.com', port: 443 },
        expect.any(Function),
      );
    });

    it('should reject invalid target type', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: [],
      };

      await expect(transport.connect(target)).rejects.toThrow(
        'Invalid target type for tcp transport',
      );
    });

    it('should handle connection errors', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const connectPromise = transport.connect(target);

      // Simulate connection error
      setTimeout(() => {
        mockSocket.emit('error', new Error('Connection refused'));
      }, 20);

      await expect(connectPromise).rejects.toThrow('Connection refused');
    });

    it('should handle connection timeout', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        timeout: 100,
      };

      const connectPromise = transport.connect(target);

      // Simulate timeout
      setTimeout(() => {
        mockSocket.emit('timeout');
      }, 20);

      await expect(connectPromise).rejects.toThrow('Connection timeout');
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);

      await connectPromise;
    });

    it('should send messages correctly', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await transport.send(message);

      expect(mockSocket.write).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
        'utf-8',
        expect.any(Function),
      );
    });

    it('should reject sending when not connected', async () => {
      const disconnectedTransport = new TcpTransport();
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await expect(disconnectedTransport.send(message)).rejects.toThrow(
        'Transport not connected',
      );
    });

    it('should handle write errors', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      // Mock write to call callback with error
      (mockSocket.write as jest.Mock).mockImplementation(
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
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);

      await connectPromise;
    });

    it('should parse complete JSON messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message) + '\n';

      mockSocket.emit('data', Buffer.from(data));

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should buffer incomplete messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message) + '\n';

      // Send message in chunks
      mockSocket.emit('data', Buffer.from(data.slice(0, 10)));
      mockSocket.emit('data', Buffer.from(data.slice(10)));

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle multiple messages in one data chunk', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message1 = { jsonrpc: '2.0', result: 'test1' };
      const message2 = { jsonrpc: '2.0', result: 'test2' };
      const data =
        JSON.stringify(message1) + '\n' + JSON.stringify(message2) + '\n';

      mockSocket.emit('data', Buffer.from(data));

      expect(messageHandler).toHaveBeenCalledTimes(2);
      expect(messageHandler).toHaveBeenNthCalledWith(1, message1);
      expect(messageHandler).toHaveBeenNthCalledWith(2, message2);
    });

    it('should handle malformed JSON gracefully', () => {
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      transport.on('message', messageHandler);
      transport.on('error', errorHandler);

      mockSocket.emit('data', Buffer.from('{ invalid json }\n'));

      expect(messageHandler).not.toHaveBeenCalled();
      // Should handle gracefully without crashing
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);

      await connectPromise;
    });

    it('should close gracefully', async () => {
      const closePromise = transport.close();

      // Simulate socket close
      setTimeout(() => {
        mockSocket.emit('close');
      }, 10);

      await closePromise;

      expect(mockSocket.end).toHaveBeenCalled();
      expect(transport.state).toBe('disconnected');
    });

    it('should force close if graceful shutdown fails', async () => {
      const closePromise = transport.close();

      // Don't emit close event to trigger force close
      await closePromise;

      expect(mockSocket.end).toHaveBeenCalled();
      expect(mockSocket.destroy).toHaveBeenCalled();
    }, 4000);
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);

      await connectPromise;
    });

    it('should handle socket errors', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockSocket.emit('error', new Error('Socket error'));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Socket error',
        }),
      );
    });

    it('should handle socket close with error', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockSocket.emit('close', true); // hadError = true

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Socket closed due to error',
        }),
      );
    });

    it('should handle socket timeout', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockSocket.emit('timeout');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Socket timeout',
        }),
      );
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const connectPromise = transport.connect(target);

      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);

      await connectPromise;
    });

    it('should track message statistics', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await transport.send(message);

      const stats = transport.stats;
      expect(stats.messagesSent).toBe(1);
      expect(stats.bytesTransferred).toBeGreaterThan(0);
    });

    it('should track received messages', () => {
      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message) + '\n';

      mockSocket.emit('data', Buffer.from(data));

      const stats = transport.stats;
      expect(stats.messagesReceived).toBe(1);
      expect(stats.bytesTransferred).toBeGreaterThan(0);
    });
  });
});
