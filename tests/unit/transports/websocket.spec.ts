/**
 * Comprehensive unit tests for WebSocket transport
 */

import { WebSocketTransport } from '../../../src/transports/websocket';
import { Target } from '../../../src/types/config';
import WebSocket from 'ws';

// Mock WebSocket
jest.mock('ws');

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let target: Target & { type: 'websocket' };
  let mockWebSocket: jest.Mocked<WebSocket>;

  beforeEach(() => {
    target = {
      type: 'websocket',
      url: 'ws://localhost:8080',
      headers: { 'User-Agent': 'mcp-check' },
      protocols: ['mcp'],
    };

    // Reset WebSocket mock
    jest.clearAllMocks();

    mockWebSocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      terminate: jest.fn(),
    } as any;

    (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(
      () => mockWebSocket,
    );

    transport = new WebSocketTransport();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    it('should create WebSocket transport instance', () => {
      expect(transport).toBeInstanceOf(WebSocketTransport);
      expect(transport.type).toBe('websocket');
    });

    it('should inherit from BaseTransport', () => {
      expect(transport.state).toBe('disconnected');
      expect(transport.stats).toEqual({
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
      });
    });
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection', async () => {
      const connectPromise = transport.connect(target);

      // Simulate WebSocket open event
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];

      if (openHandler) {
        (openHandler as Function)();
      }

      await connectPromise;

      expect(WebSocket).toHaveBeenCalledWith(target.url, target.protocols, {
        headers: target.headers,
      });
      expect(transport.state).toBe('connected');
    });

    it('should handle connection failures', async () => {
      const connectPromise = transport.connect(target);

      // Simulate WebSocket error event
      const errorHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1];

      if (errorHandler) {
        (errorHandler as Function)(new Error('Connection failed'));
      }

      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should handle connection timeout', async () => {
      jest.useFakeTimers();

      const connectPromise = transport.connect(target);

      // Don't trigger open event and advance timers to trigger timeout
      jest.advanceTimersByTime(10000);

      await expect(connectPromise).rejects.toThrow(
        'WebSocket connection timeout',
      );

      jest.useRealTimers();
    });

    it('should reject invalid target type', async () => {
      const invalidTarget = { type: 'tcp' } as any;

      await expect(transport.connect(invalidTarget)).rejects.toThrow(
        'Invalid target type for WebSocket transport',
      );
    });

    it('should close WebSocket connection', async () => {
      // First connect
      const connectPromise = transport.connect(target);
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;

      // Then close
      await transport.close();

      expect(mockWebSocket.close).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      // Establish connection first
      const connectPromise = transport.connect(target);
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;
    });

    it('should send messages over WebSocket', async () => {
      const testMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: { data: 'test' },
      };

      await transport.send(testMessage);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify(testMessage),
      );
      expect(transport.stats.messagesSent).toBe(1);
    });

    it('should handle send errors', async () => {
      mockWebSocket.send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const testMessage = { jsonrpc: '2.0', id: 1, method: 'test' };

      await expect(transport.send(testMessage)).rejects.toThrow('Send failed');
    });

    it('should receive and emit messages', async () => {
      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const testMessage = {
        jsonrpc: '2.0',
        id: 1,
        result: { data: 'response' },
      };

      // Simulate message reception
      const msgHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1];

      if (msgHandler) {
        (msgHandler as Function)(JSON.stringify(testMessage));
      }

      expect(messageHandler).toHaveBeenCalledWith(testMessage);
      expect(transport.stats.messagesReceived).toBe(1);
    });

    it('should handle malformed messages', async () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      // Simulate malformed message
      const msgHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1];

      if (msgHandler) {
        (msgHandler as Function)('invalid-json');
      }

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('parse'),
        }),
      );
    });
  });

  describe('Event Handling', () => {
    it('should handle WebSocket errors', async () => {
      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      // Connect first
      const connectPromise = transport.connect(target);
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;

      // Simulate WebSocket error after connection
      const wsErrorHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1];

      if (wsErrorHandler) {
        (wsErrorHandler as Function)(new Error('WebSocket runtime error'));
      }

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'WebSocket runtime error',
        }),
      );
    });

    it('should handle WebSocket close events', async () => {
      const closeHandler = jest.fn();
      transport.on('close', closeHandler);

      // Connect first
      const connectPromise = transport.connect(target);
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;

      // Simulate WebSocket close
      const wsCloseHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];

      if (wsCloseHandler) {
        (wsCloseHandler as Function)(1000, 'Normal closure');
      }

      expect(transport.state).toBe('disconnected');
    });
  });

  describe('Connection States', () => {
    it('should transition through connection states', async () => {
      expect(transport.state).toBe('disconnected');

      const connectPromise = transport.connect(target);
      expect(transport.state).toBe('connecting');

      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;

      expect(transport.state).toBe('connected');
    });

    it('should handle disconnection', async () => {
      // Connect first
      const connectPromise = transport.connect(target);
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;

      expect(transport.state).toBe('connected');

      // Simulate close
      const closeHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      if (closeHandler) (closeHandler as Function)(1000, 'Normal closure');

      expect(transport.state).toBe('disconnected');
    });
  });

  describe('Statistics Tracking', () => {
    beforeEach(async () => {
      const connectPromise = transport.connect(target);
      const openHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'open',
      )?.[1];
      if (openHandler) (openHandler as Function)();
      await connectPromise;
    });

    it('should track sent messages', async () => {
      const initialStats = transport.stats;
      expect(initialStats.messagesSent).toBe(0);

      await transport.send({ test: 'message' });

      const updatedStats = transport.stats;
      expect(updatedStats.messagesSent).toBe(1);
    });

    it('should track received messages', () => {
      const initialStats = transport.stats;
      expect(initialStats.messagesReceived).toBe(0);

      // Simulate message reception
      const msgHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'message',
      )?.[1];

      if (msgHandler) {
        (msgHandler as Function)('{"test": "response"}');
      }

      const updatedStats = transport.stats;
      expect(updatedStats.messagesReceived).toBe(1);
    });

    it('should track bytes transferred', async () => {
      const message = { test: 'data' };
      const messageSize = JSON.stringify(message).length;

      await transport.send(message);

      expect(transport.stats.bytesTransferred).toBeGreaterThanOrEqual(
        messageSize,
      );
    });
  });

  describe('WebSocket Configuration', () => {
    it('should pass through WebSocket configuration', async () => {
      const customTarget: Target & { type: 'websocket' } = {
        type: 'websocket',
        url: 'wss://secure.example.com:443/mcp',
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'value',
        },
        protocols: ['mcp-v1', 'mcp-v2'],
      };

      await transport.connect(customTarget).catch(() => {}); // Ignore connection errors

      expect(WebSocket).toHaveBeenCalledWith(
        customTarget.url,
        customTarget.protocols,
        { headers: customTarget.headers },
      );
    });

    it('should handle missing optional configuration', async () => {
      const minimalTarget: Target & { type: 'websocket' } = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(minimalTarget).catch(() => {}); // Ignore connection errors

      expect(WebSocket).toHaveBeenCalledWith(minimalTarget.url, undefined, {
        headers: undefined,
      });
    });
  });

  describe('Error Recovery', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      for (let i = 0; i < 3; i++) {
        const connectPromise = transport.connect(target);
        const openHandler = mockWebSocket.on.mock.calls.find(
          (call) => call[0] === 'open',
        )?.[1];
        if (openHandler) (openHandler as Function)();
        await connectPromise;

        await transport.close();
      }

      expect(transport.state).toBe('disconnected');
    });

    it('should cleanup on connection failure', async () => {
      const connectPromise = transport.connect(target);

      // Simulate connection error
      const errorHandler = mockWebSocket.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1];

      if (errorHandler) {
        (errorHandler as Function)(new Error('Connection error'));
      }

      await expect(connectPromise).rejects.toThrow();
      expect(transport.state).toBe('disconnected');
    });
  });
});
