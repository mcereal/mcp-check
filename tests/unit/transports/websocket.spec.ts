/**
 * Unit tests for WebSocketTransport
 */

import { WebSocketTransport } from '../../../src/transports/websocket';
import { Target } from '../../../src/types/config';
import { EventEmitter } from 'events';

// Mock ws module
jest.mock('ws');

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let mockWebSocket: any;

  beforeEach(() => {
    transport = new WebSocketTransport();
    mockWebSocket = new EventEmitter();

    // Add WebSocket properties and methods
    mockWebSocket.send = jest.fn((data, callback) => {
      if (callback) setTimeout(callback, 0);
    });
    mockWebSocket.close = jest.fn();
    mockWebSocket.terminate = jest.fn();
    mockWebSocket.readyState = 0; // CONNECTING

    // Add readyState constants
    mockWebSocket.CONNECTING = 0;
    mockWebSocket.OPEN = 1;
    mockWebSocket.CLOSING = 2;
    mockWebSocket.CLOSED = 3;

    // Mock WebSocket constructor
    const WS = require('ws');
    WS.WebSocket = jest.fn().mockImplementation((url, protocols, options) => {
      setTimeout(() => {
        mockWebSocket.readyState = 1; // OPEN
        mockWebSocket.emit('open');
      }, 10);
      return mockWebSocket;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct type', () => {
      expect(transport.type).toBe('websocket');
      expect(transport.state).toBe('disconnected');
    });
  });

  describe('Connection', () => {
    it('should connect to WebSocket target successfully', async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
        headers: { Authorization: 'Bearer token' },
        protocols: ['mcp'],
      };

      const connectPromise = transport.connect(target);
      await connectPromise;

      expect(transport.state).toBe('connected');

      const WS = require('ws');
      expect(WS.WebSocket).toHaveBeenCalledWith(
        'ws://localhost:8080',
        ['mcp'],
        {
          headers: { Authorization: 'Bearer token' },
        },
      );
    });

    it('should connect without protocols or headers', async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      const connectPromise = transport.connect(target);
      await connectPromise;

      expect(transport.state).toBe('connected');

      const WS = require('ws');
      expect(WS.WebSocket).toHaveBeenCalledWith('ws://localhost:8080', [], {});
    });

    it('should reject invalid target type', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'node',
        args: [],
      };

      await expect(transport.connect(target)).rejects.toThrow(
        'Invalid target type for websocket transport',
      );
    });

    it('should handle connection errors', async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      // Mock WebSocket to emit error
      const WS = require('ws');
      WS.WebSocket.mockImplementation(() => {
        setTimeout(() => {
          mockWebSocket.emit('error', new Error('Connection failed'));
        }, 10);
        return mockWebSocket;
      });

      await expect(transport.connect(target)).rejects.toThrow(
        'Connection failed',
      );
    });

    it('should handle unexpected close during connection', async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      // Mock WebSocket to close unexpectedly
      const WS = require('ws');
      WS.WebSocket.mockImplementation(() => {
        setTimeout(() => {
          mockWebSocket.emit('close', 1006, 'Abnormal closure');
        }, 10);
        return mockWebSocket;
      });

      await expect(transport.connect(target)).rejects.toThrow(
        'WebSocket closed during connection',
      );
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(target);
    });

    it('should send messages correctly', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await transport.send(message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify(message),
        expect.any(Function),
      );
    });

    it('should reject sending when not connected', async () => {
      const disconnectedTransport = new WebSocketTransport();
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      await expect(disconnectedTransport.send(message)).rejects.toThrow(
        'Transport not connected',
      );
    });

    it('should handle send errors', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      // Mock send to call callback with error
      mockWebSocket.send.mockImplementation((data, callback) => {
        if (callback) callback(new Error('Send failed'));
      });

      await expect(transport.send(message)).rejects.toThrow('Send failed');
    });

    it('should reject sending when WebSocket is not open', async () => {
      const message = { jsonrpc: '2.0', method: 'test', id: 1 };

      // Set WebSocket state to closing
      mockWebSocket.readyState = 2; // CLOSING

      await expect(transport.send(message)).rejects.toThrow(
        'WebSocket is not open',
      );
    });
  });

  describe('Message Reception', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(target);
    });

    it('should parse JSON messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message);

      mockWebSocket.emit('message', Buffer.from(data));

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle string messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = JSON.stringify(message);

      mockWebSocket.emit('message', data);

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle malformed JSON gracefully', () => {
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      transport.on('message', messageHandler);
      transport.on('error', errorHandler);

      mockWebSocket.emit('message', '{ invalid json }');

      expect(messageHandler).not.toHaveBeenCalled();
      // Should handle gracefully without crashing
    });

    it('should handle binary messages', () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const data = Buffer.from(JSON.stringify(message));

      mockWebSocket.emit('message', data);

      expect(messageHandler).toHaveBeenCalledWith(message);
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(target);
    });

    it('should close gracefully', async () => {
      const closePromise = transport.close();

      // Simulate WebSocket close
      setTimeout(() => {
        mockWebSocket.emit('close', 1000, 'Normal closure');
      }, 10);

      await closePromise;

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Normal closure');
      expect(transport.state).toBe('disconnected');
    });

    it('should force close if graceful shutdown fails', async () => {
      const closePromise = transport.close();

      // Don't emit close event to trigger force close
      await closePromise;

      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(mockWebSocket.terminate).toHaveBeenCalled();
    }, 4000);
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(target);
    });

    it('should handle WebSocket errors', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockWebSocket.emit('error', new Error('WebSocket error'));

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'WebSocket error',
        }),
      );
    });

    it('should handle unexpected close', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockWebSocket.emit('close', 1006, 'Abnormal closure');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'WebSocket closed with code 1006: Abnormal closure',
        }),
      );
    });

    it('should handle normal close gracefully', () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      mockWebSocket.emit('close', 1000, 'Normal closure');

      expect(errorHandler).not.toHaveBeenCalled();
      expect(transport.state).toBe('disconnected');
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(target);
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
      const data = JSON.stringify(message);

      mockWebSocket.emit('message', data);

      const stats = transport.stats;
      expect(stats.messagesReceived).toBe(1);
      expect(stats.bytesTransferred).toBeGreaterThan(0);
    });
  });
});
