/**
 * Unit tests for WebSocketTransport
 */

import { WebSocketTransport } from '../../../src/transports/websocket';
import { Target } from '../../../src/types/config';
import { EventEmitter } from 'events';

// Create a simple mock WebSocket
const mockWebSocketInstance = {
  send: jest.fn(),
  close: jest.fn(),
  terminate: jest.fn(),
  readyState: 1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  on: jest.fn(),
  emit: jest.fn(),
};

// Mock the ws module
jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => {
    // Make the mock instance an event emitter
    Object.setPrototypeOf(mockWebSocketInstance, EventEmitter.prototype);
    EventEmitter.call(mockWebSocketInstance);

    // Reset mocks
    mockWebSocketInstance.send.mockClear();
    mockWebSocketInstance.close.mockClear();
    mockWebSocketInstance.terminate.mockClear();
    mockWebSocketInstance.on.mockClear();

    // Setup default behavior
    mockWebSocketInstance.send.mockImplementation((data, callback) => {
      if (callback) setTimeout(callback, 1);
    });

    // Simulate successful connection
    setTimeout(() => {
      mockWebSocketInstance.emit('open');
    }, 1);

    return mockWebSocketInstance;
  });
});

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;

  beforeEach(() => {
    transport = new WebSocketTransport();
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

      await transport.connect(target);

      expect(transport.state).toBe('connected');
    });

    it('should reject invalid targets', async () => {
      const target = {
        type: 'stdio',
        command: 'node',
        args: [],
      } as any;

      await expect(transport.connect(target)).rejects.toThrow(
        'Invalid target type for WebSocket transport',
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

      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
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
  });

  describe('Message Receiving', () => {
    beforeEach(async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      await transport.connect(target);
    });

    it('should handle incoming JSON messages', (done) => {
      const message = { jsonrpc: '2.0', result: 'test', id: 1 };
      const data = JSON.stringify(message);

      transport.on('message', (received) => {
        expect(received).toEqual(message);
        done();
      });

      mockWebSocketInstance.emit('message', data);
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

    it('should close cleanly', async () => {
      setTimeout(() => {
        mockWebSocketInstance.emit('close', 1000, 'Normal closure');
      }, 10);

      await transport.close();

      expect(mockWebSocketInstance.close).toHaveBeenCalled();
    });
  });
});
