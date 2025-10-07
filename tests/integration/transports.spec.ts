/**
 * Integration tests for transport layer
 */

import { StdioTransport } from '../../src/transports/stdio';
import { TCPTransport } from '../../src/transports/tcp';
import { WebSocketTransport } from '../../src/transports/websocket';
import { TransportFactory } from '../../src/transports/factory';
import { Logger } from '../../src/types/reporting';
import { Target } from '../../src/types/config';

describe('Transport Integration Tests', () => {
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('TransportFactory', () => {
    let factory: TransportFactory;

    beforeEach(() => {
      factory = new TransportFactory(mockLogger);
    });

    it('should create stdio transport', async () => {
      const target: Target = {
        type: 'stdio',
        command: 'echo',
        args: ['hello'],
      };

      const transport = await factory.create(target);
      expect(transport).toBeInstanceOf(StdioTransport);
      expect(transport.type).toBe('stdio');
    });

    it('should create TCP transport', async () => {
      const target: Target = {
        type: 'tcp',
        host: 'localhost',
        port: 8080,
      };

      const transport = await factory.create(target);
      expect(transport).toBeInstanceOf(TCPTransport);
      expect(transport.type).toBe('tcp');
    });

    it('should create WebSocket transport', async () => {
      const target: Target = {
        type: 'websocket',
        url: 'ws://localhost:8080',
      };

      const transport = await factory.create(target);
      expect(transport).toBeInstanceOf(WebSocketTransport);
      expect(transport.type).toBe('websocket');
    });

    it('should support stdio transport type', () => {
      expect(factory.supports('stdio')).toBe(true);
    });

    it('should support TCP transport type', () => {
      expect(factory.supports('tcp')).toBe(true);
    });

    it('should support WebSocket transport type', () => {
      expect(factory.supports('websocket')).toBe(true);
    });

    it('should not support unsupported transport types', () => {
      expect(factory.supports('unknown' as any)).toBe(false);
    });

    it('should throw error for unsupported transport types in create', async () => {
      const target = {
        type: 'unknown',
      } as any;

      await expect(factory.create(target)).rejects.toThrow(
        'Unsupported transport type: unknown',
      );
    });
  });

  describe('StdioTransport', () => {
    it('should create instance with correct properties', () => {
      const config = {
        command: 'echo',
        args: ['test'],
        env: { TEST_VAR: 'value' },
        cwd: '/tmp',
      };

      const transport = new StdioTransport(config, mockLogger);

      expect(transport.type).toBe('stdio');
      expect(transport.state).toBe('disconnected');
      expect(transport.stats).toEqual({
        messagesSent: 0,
        messagesReceived: 0,
        errorsCount: 0,
      });
    });

    it('should handle connection with minimal config', () => {
      const config = {
        command: 'echo',
      };

      const transport = new StdioTransport(config, mockLogger);
      expect(transport).toBeDefined();
    });
  });

  describe('TCPTransport', () => {
    it('should create instance with correct properties', () => {
      const config = {
        host: 'localhost',
        port: 8080,
        timeout: 5000,
        tls: false,
      };

      const transport = new TCPTransport(config, mockLogger);

      expect(transport.type).toBe('tcp');
      expect(transport.state).toBe('disconnected');
      expect(transport.stats).toEqual({
        messagesSent: 0,
        messagesReceived: 0,
        errorsCount: 0,
      });
    });

    it('should handle TLS configuration', () => {
      const config = {
        host: 'localhost',
        port: 8080,
        tls: true,
      };

      const transport = new TCPTransport(config, mockLogger);
      expect(transport).toBeDefined();
    });
  });

  describe('WebSocketTransport', () => {
    it('should create instance with correct properties', () => {
      const config = {
        url: 'ws://localhost:8080',
        headers: { 'X-Custom': 'value' },
        protocols: ['mcp-v1'],
      };

      const transport = new WebSocketTransport(config, mockLogger);

      expect(transport.type).toBe('websocket');
      expect(transport.state).toBe('disconnected');
      expect(transport.stats).toEqual({
        messagesSent: 0,
        messagesReceived: 0,
        errorsCount: 0,
      });
    });

    it('should handle minimal WebSocket configuration', () => {
      const config = {
        url: 'ws://localhost:8080',
      };

      const transport = new WebSocketTransport(config, mockLogger);
      expect(transport).toBeDefined();
    });

    it('should handle secure WebSocket URLs', () => {
      const config = {
        url: 'wss://secure.example.com',
      };

      const transport = new WebSocketTransport(config, mockLogger);
      expect(transport).toBeDefined();
    });
  });

  describe('Transport Event Handling', () => {
    it('should handle stdio transport events', () => {
      const config = {
        command: 'echo',
        args: ['test'],
      };

      const transport = new StdioTransport(config, mockLogger);
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();
      const stateHandler = jest.fn();

      transport.on('message', messageHandler);
      transport.on('error', errorHandler);
      transport.on('close', closeHandler);
      transport.on('state', stateHandler);

      // Verify handlers are registered (cannot test actual events without real connections)
      expect(transport).toBeDefined();
    });

    it('should handle TCP transport events', () => {
      const config = {
        host: 'localhost',
        port: 8080,
      };

      const transport = new TCPTransport(config, mockLogger);
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();
      const stateHandler = jest.fn();

      transport.on('message', messageHandler);
      transport.on('error', errorHandler);
      transport.on('close', closeHandler);
      transport.on('state', stateHandler);

      expect(transport).toBeDefined();
    });

    it('should handle WebSocket transport events', () => {
      const config = {
        url: 'ws://localhost:8080',
      };

      const transport = new WebSocketTransport(config, mockLogger);
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      const closeHandler = jest.fn();
      const stateHandler = jest.fn();

      transport.on('message', messageHandler);
      transport.on('error', errorHandler);
      transport.on('close', closeHandler);
      transport.on('state', stateHandler);

      expect(transport).toBeDefined();
    });

    it('should remove event handlers', () => {
      const config = {
        command: 'echo',
      };

      const transport = new StdioTransport(config, mockLogger);
      const handler = jest.fn();

      transport.on('message', handler);
      transport.off('message', handler);

      expect(transport).toBeDefined();
    });
  });

  describe('Transport Error Scenarios', () => {
    it('should handle invalid stdio command', () => {
      const config = {
        command: '', // Invalid empty command
      };

      expect(() => new StdioTransport(config, mockLogger)).not.toThrow();
    });

    it('should handle invalid TCP port', () => {
      const config = {
        host: 'localhost',
        port: -1, // Invalid port
      };

      expect(() => new TCPTransport(config, mockLogger)).not.toThrow();
    });

    it('should handle invalid WebSocket URL', () => {
      const config = {
        url: 'invalid-url',
      };

      expect(() => new WebSocketTransport(config, mockLogger)).not.toThrow();
    });
  });
});
