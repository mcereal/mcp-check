import { EventEmitter } from 'events';
import { TcpTransport } from '../../../src/transports/tcp';
import { Target } from '../../../src/types/config';

class MockSocket extends EventEmitter {
  write = jest.fn(
    (data: string, encoding: string, cb?: (err?: Error) => void) => {
      cb?.();
      return true;
    },
  );
  end = jest.fn(() => {
    this.emit('close', false);
  });
  destroy = jest.fn();
  on = jest.fn((event: string, listener: (...args: any[]) => void) => {
    return super.on(event, listener);
  });
}

let activeSocket: MockSocket;
let connectCallback: (() => void) | undefined;

jest.mock('net', () => ({
  connect: jest.fn((options: any, callback: () => void) => {
    connectCallback = callback;
    return activeSocket;
  }),
}));

jest.mock('tls', () => ({
  connect: jest.fn((options: any, callback: () => void) => {
    connectCallback = callback;
    return activeSocket;
  }),
}));

const net = require('net');
const tls = require('tls');

describe('TcpTransport', () => {
  let transport: TcpTransport;
  let target: Target & { type: 'tcp' };

  beforeEach(() => {
    activeSocket = new MockSocket();
    connectCallback = undefined;
    transport = new TcpTransport();
    target = {
      type: 'tcp',
      host: 'localhost',
      port: 8080,
    };
    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await transport.close();
    } catch {
      // Ignore close errors in cleanup
    }
  });

  describe('connect', () => {
    it('connects successfully to TCP server', async () => {
      const connectPromise = transport.connect(target);
      // Simulate successful connection
      connectCallback?.();
      await expect(connectPromise).resolves.toBeUndefined();
      expect(transport.state).toBe('connected');
      expect(net.connect).toHaveBeenCalledWith(
        { host: 'localhost', port: 8080 },
        expect.any(Function),
      );
    });

    it('connects with TLS when tls option is true', async () => {
      const tlsTarget: Target & { type: 'tcp' } = {
        ...target,
        tls: true,
      };
      const connectPromise = transport.connect(tlsTarget);
      connectCallback?.();
      await expect(connectPromise).resolves.toBeUndefined();
      expect(transport.state).toBe('connected');
      expect(tls.connect).toHaveBeenCalledWith(
        { host: 'localhost', port: 8080 },
        expect.any(Function),
      );
    });

    it('rejects when socket emits error before connecting', async () => {
      const error = new Error('Connection refused');
      const connectPromise = transport.connect(target);
      activeSocket.emit('error', error);
      await expect(connectPromise).rejects.toThrow('Connection refused');
      expect(transport.state).toBe('error');
    });

    it('rejects for invalid target type', async () => {
      const invalidTarget = {
        type: 'stdio' as const,
        command: 'node',
      };
      await expect(transport.connect(invalidTarget as any)).rejects.toThrow(
        'Invalid target type for TCP transport',
      );
    });

    it('times out when connection takes too long', async () => {
      jest.useFakeTimers();
      const slowTarget: Target & { type: 'tcp' } = {
        ...target,
        timeout: 1000,
      };
      const connectPromise = transport.connect(slowTarget);

      // Advance time past the timeout
      jest.advanceTimersByTime(1001);

      await expect(connectPromise).rejects.toThrow(
        'Connection timeout to localhost:8080',
      );
      jest.useRealTimers();
    });
  });

  describe('send', () => {
    it('serializes and sends messages', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      await transport.send({ jsonrpc: '2.0', method: 'ping' });

      expect(activeSocket.write).toHaveBeenCalledWith(
        JSON.stringify({ jsonrpc: '2.0', method: 'ping' }) + '\n',
        'utf-8',
        expect.any(Function),
      );
      expect(transport.stats.messagesSent).toBe(1);
    });

    it('rejects when not connected', async () => {
      await expect(
        transport.send({ jsonrpc: '2.0', method: 'ping' }),
      ).rejects.toThrow('Transport not connected');
    });

    it('rejects when write fails', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      activeSocket.write = jest.fn(
        (data: string, encoding: string, cb?: (err?: Error) => void) => {
          cb?.(new Error('Write failed'));
          return false;
        },
      );

      await expect(
        transport.send({ jsonrpc: '2.0', method: 'ping' }),
      ).rejects.toThrow('Write failed');
    });
  });

  describe('receive', () => {
    it('parses incoming messages and emits events', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      // Simulate receiving data
      const message = { jsonrpc: '2.0', result: 'pong' };
      activeSocket.emit('data', Buffer.from(JSON.stringify(message) + '\n'));

      expect(messageHandler).toHaveBeenCalledWith(message);
      expect(transport.stats.messagesReceived).toBe(1);
    });

    it('handles multiple messages in one data chunk', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const msg1 = { jsonrpc: '2.0', id: 1, result: 'a' };
      const msg2 = { jsonrpc: '2.0', id: 2, result: 'b' };
      activeSocket.emit(
        'data',
        Buffer.from(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2) + '\n'),
      );

      expect(messageHandler).toHaveBeenCalledTimes(2);
      expect(messageHandler).toHaveBeenNthCalledWith(1, msg1);
      expect(messageHandler).toHaveBeenNthCalledWith(2, msg2);
    });

    it('buffers partial messages across data chunks', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      const messageHandler = jest.fn();
      transport.on('message', messageHandler);

      const message = { jsonrpc: '2.0', result: 'test' };
      const fullMessage = JSON.stringify(message);
      const half = Math.floor(fullMessage.length / 2);

      // Send first half
      activeSocket.emit('data', Buffer.from(fullMessage.slice(0, half)));
      expect(messageHandler).not.toHaveBeenCalled();

      // Send second half with newline
      activeSocket.emit('data', Buffer.from(fullMessage.slice(half) + '\n'));
      expect(messageHandler).toHaveBeenCalledWith(message);
    });
  });

  describe('close', () => {
    it('closes gracefully', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      await transport.close();
      expect(activeSocket.end).toHaveBeenCalled();
      expect(transport.state).toBe('disconnected');
    });

    it('handles close when not connected', async () => {
      await expect(transport.close()).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('handles socket errors after connection', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      const errorHandler = jest.fn();
      transport.on('error', errorHandler);

      activeSocket.emit('error', new Error('Socket error'));
      expect(transport.state).toBe('error');
    });

    it('handles socket timeout', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      activeSocket.emit('timeout');
      expect(transport.state).toBe('error');
    });

    it('handles socket close with error', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      activeSocket.emit('close', true); // hadError = true
      expect(transport.state).toBe('error');
    });
  });

  describe('stats', () => {
    it('tracks connection time', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      expect(transport.stats.connectionTime).toBeGreaterThanOrEqual(0);
    });

    it('tracks bytes transferred', async () => {
      const connectPromise = transport.connect(target);
      connectCallback?.();
      await connectPromise;

      await transport.send({ test: 'data' });
      const bytesAfterSend = transport.stats.bytesTransferred;
      expect(bytesAfterSend).toBeGreaterThan(0);

      activeSocket.emit('data', Buffer.from('{"result":"ok"}\n'));
      expect(transport.stats.bytesTransferred).toBeGreaterThan(bytesAfterSend);
    });
  });
});
