/**
 * Unit tests for TcpTransport
 */

import { TcpTransport } from '../../../src/transports/tcp';
import { Target } from '../../../src/types/config';
import { Socket } from 'net';
import { EventEmitter } from 'events';

// Mock net and tls modules
jest.mock('net');
jest.mock('tls');

describe('TcpTransport', () => {
  let transport: TcpTransport;
  let mockSocket: Partial<Socket> & EventEmitter;

  beforeEach(() => {
    transport = new TcpTransport();
    mockSocket = new EventEmitter() as Partial<Socket> & EventEmitter;

    // Add socket methods
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

    // Mock net.connect and tls.connect
    const net = require('net');
    const tls = require('tls');

    net.connect = jest.fn().mockImplementation((options, callback) => {
      setTimeout(() => {
        if (callback) callback();
        mockSocket.emit('connect');
      }, 10);
      return mockSocket;
    });

    tls.connect = jest.fn().mockImplementation((options, callback) => {
      setTimeout(() => {
        if (callback) callback();
        mockSocket.emit('secureConnect');
      }, 10);
      return mockSocket;
    });
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

      await transport.connect(target);

      expect(transport.state).toBe('connected');

      const net = require('net');
      expect(net.connect).toHaveBeenCalledWith(
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

      await transport.connect(target);

      expect(transport.state).toBe('connected');

      const tls = require('tls');
      expect(tls.connect).toHaveBeenCalledWith(
        { host: 'example.com', port: 443 },
        expect.any(Function),
      );
    });

    it('should reject invalid target type', async () => {
      const target = {
        type: 'stdio',
        command: 'node',
        args: [],
      } as any;

      await expect(transport.connect(target)).rejects.toThrow(
        'Invalid target type for TCP transport',
      );
    });

    it('should handle connection errors', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      // Mock connect to emit error
      const net = require('net');
      net.connect.mockImplementation((options, callback) => {
        setTimeout(() => {
          mockSocket.emit('error', new Error('Connection refused'));
        }, 10);
        return mockSocket;
      });

      await expect(transport.connect(target)).rejects.toThrow(
        'Connection refused',
      );
    });

    it('should handle connection timeout', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
        timeout: 50, // Short timeout
      };

      // Mock connect to not respond
      const net = require('net');
      net.connect.mockImplementation(() => {
        // Don't call callback or emit connect
        return mockSocket;
      });

      await expect(transport.connect(target)).rejects.toThrow(
        'Connection timeout',
      );
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      await transport.connect(target);
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

      // Mock write to fail
      mockSocket.write = jest
        .fn()
        .mockImplementation((data, encoding, callback) => {
          if (callback) callback(new Error('Write failed'));
          return false;
        });

      await expect(transport.send(message)).rejects.toThrow('Write failed');
    });
  });

  describe('Message Reception', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      await transport.connect(target);
    });

    it('should parse complete JSON messages', (done) => {
      const message = { jsonrpc: '2.0', result: 'test', id: 1 };
      const data = JSON.stringify(message) + '\n';

      transport.on('message', (received) => {
        expect(received).toEqual(message);
        done();
      });

      mockSocket.emit('data', Buffer.from(data));
    });

    it('should buffer incomplete messages', (done) => {
      const message = { jsonrpc: '2.0', result: 'test', id: 1 };
      const data = JSON.stringify(message) + '\n';

      transport.on('message', (received) => {
        expect(received).toEqual(message);
        done();
      });

      // Send partial data first
      mockSocket.emit('data', Buffer.from(data.slice(0, 10)));
      // Then send the rest
      setTimeout(() => {
        mockSocket.emit('data', Buffer.from(data.slice(10)));
      }, 10);
    });

    it('should handle multiple messages in one data chunk', () => {
      const messages = [
        { jsonrpc: '2.0', result: 'test1', id: 1 },
        { jsonrpc: '2.0', result: 'test2', id: 2 },
      ];
      const data = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';

      const receivedMessages: any[] = [];
      transport.on('message', (message) => {
        receivedMessages.push(message);
      });

      mockSocket.emit('data', Buffer.from(data));

      // Give it time to process
      setTimeout(() => {
        expect(receivedMessages).toEqual(messages);
      }, 10);
    });

    it('should handle malformed JSON gracefully', () => {
      const logSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockSocket.emit('data', Buffer.from('invalid json\n'));

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      await transport.connect(target);
    });

    it('should close gracefully', async () => {
      setTimeout(() => {
        mockSocket.emit('close');
      }, 10);

      await transport.close();

      expect(mockSocket.end).toHaveBeenCalled();
      expect(transport.state).toBe('disconnected');
    });

    it('should force close if graceful shutdown fails', async () => {
      // Mock end to not emit close event
      mockSocket.end = jest.fn();

      const closePromise = transport.close();

      // Don't emit close event to trigger force close
      await closePromise;

      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      await transport.connect(target);
    });

    it('should handle socket errors', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      const error = new Error('Socket error');
      mockSocket.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should handle socket close with error', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockSocket.emit('close', true); // hadError = true

      expect(transport.state).toBe('error');
    });

    it('should handle unexpected socket close', () => {
      const closeHandler = jest.fn();
      transport.on('close', closeHandler);

      mockSocket.emit('close', false); // Normal close

      expect(transport.state).toBe('disconnected');
      expect(closeHandler).toHaveBeenCalled();
    });

    it('should not reconnect on unexpected close', () => {
      const connectSpy = jest.spyOn(transport, 'connect');

      mockSocket.emit('close', false);

      expect(connectSpy).not.toHaveBeenCalled();
    });
  });

  describe('Stats', () => {
    it('should track connection time', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      const startTime = Date.now();
      await transport.connect(target);

      expect(transport.stats.connectionTime).toBeGreaterThanOrEqual(0);
      expect(transport.stats.connectionTime).toBeLessThan(
        Date.now() - startTime + 100,
      );
    });

    it('should track bytes transferred', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      await transport.connect(target);

      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      await transport.send(message);

      const expectedBytes = Buffer.byteLength(JSON.stringify(message) + '\n');
      expect(transport.stats.bytesTransferred).toBe(expectedBytes);
    });

    it('should count sent and received messages', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
        tls: false,
      };

      await transport.connect(target);

      // Send a message
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };
      await transport.send(message);

      expect(transport.stats.messagesSent).toBe(1);

      // Simulate receiving a message
      const response = { jsonrpc: '2.0', result: 'ok', id: 1 };
      mockSocket.emit('data', Buffer.from(JSON.stringify(response) + '\n'));

      // Give it time to process
      setTimeout(() => {
        expect(transport.stats.messagesReceived).toBe(1);
      }, 10);
    });
  });
});
