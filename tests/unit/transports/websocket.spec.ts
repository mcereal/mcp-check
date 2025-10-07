import { EventEmitter } from 'events';
import { WebSocketTransport } from '../../../src/transports/websocket';
import { Target } from '../../../src/types/config';

class MockSocket extends EventEmitter {
  readyState = 1;
  send = jest.fn((data: string, cb?: (err?: Error) => void) => {
    cb?.();
  });
  close = jest.fn(() => {
    this.readyState = 3;
    this.emit('close', 1000);
  });
  terminate = jest.fn(() => {
    this.readyState = 3;
    this.emit('close', 1000);
  });
  off = this.removeListener;
}

let activeSocket: MockSocket;

jest.mock('ws', () => {
  return jest.fn(() => activeSocket);
});

const WebSocket: any = require('ws');
WebSocket.OPEN = 1;

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let target: Target & { type: 'websocket' };

  beforeEach(() => {
    activeSocket = new MockSocket();
    transport = new WebSocketTransport();
    target = {
      type: 'websocket',
      url: 'ws://localhost:8080',
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('connects when the socket opens', async () => {
    const connectPromise = transport.connect(target);
    activeSocket.emit('open');
    await expect(connectPromise).resolves.toBeUndefined();
    expect(transport.state).toBe('connected');
  });

  it('rejects when socket emits error before opening', async () => {
    const error = new Error('boom');
    const connectPromise = transport.connect(target);
    activeSocket.emit('error', error);
    await expect(connectPromise).rejects.toThrow('boom');
    expect(transport.state).toBe('error');
    expect(console.error).toHaveBeenCalledWith('Unhandled transport error', {
      transport: 'websocket',
      message: 'boom',
    });
  });

  it('serialises outbound messages', async () => {
    const connectPromise = transport.connect(target);
    activeSocket.emit('open');
    await connectPromise;

    await transport.send({ jsonrpc: '2.0', method: 'ping' });

    expect(activeSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
      expect.any(Function),
    );
    expect(transport.stats.messagesSent).toBe(1);
  });

  it('closes gracefully', async () => {
    const connectPromise = transport.connect(target);
    activeSocket.emit('open');
    await connectPromise;

    await transport.close();
    expect(activeSocket.close).toHaveBeenCalled();
    expect(transport.state).toBe('disconnected');
  });
});
