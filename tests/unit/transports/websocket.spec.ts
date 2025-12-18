import { WebSocketTransport } from '../../../src/transports/websocket';
import { Target } from '../../../src/types/config';

// Mock WebSocket class that mimics native WebSocket behavior
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url: string;
  protocol: string;

  private listeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocol = Array.isArray(protocols) ? protocols[0] || '' : protocols || '';
    // Store the instance for test access
    MockWebSocket.lastInstance = this;
  }

  static lastInstance: MockWebSocket | null = null;

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send = jest.fn((data: string) => {
    // Native WebSocket send is synchronous
  });

  close = jest.fn((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code: code || 1000, reason }));
  });

  // Helper to dispatch events for testing
  dispatchEvent(event: Event): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }

  // Simulate opening the connection
  simulateOpen(): void {
    this.dispatchEvent(new Event('open'));
  }

  // Simulate error
  simulateError(): void {
    this.dispatchEvent(new Event('error'));
  }

  // Simulate message
  simulateMessage(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  // Simulate close
  simulateClose(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
}

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket;

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let target: Target & { type: 'websocket' };

  beforeAll(() => {
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterAll(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  beforeEach(() => {
    MockWebSocket.lastInstance = null;
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

    // Get the mock instance and simulate open
    const mockWs = MockWebSocket.lastInstance!;
    mockWs.simulateOpen();

    await expect(connectPromise).resolves.toBeUndefined();
    expect(transport.state).toBe('connected');
  });

  it('rejects when socket emits error before opening', async () => {
    const connectPromise = transport.connect(target);

    // Get the mock instance and simulate error
    const mockWs = MockWebSocket.lastInstance!;
    mockWs.simulateError();

    await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
    expect(transport.state).toBe('error');
  });

  it('serialises outbound messages', async () => {
    const connectPromise = transport.connect(target);
    const mockWs = MockWebSocket.lastInstance!;
    mockWs.simulateOpen();
    await connectPromise;

    await transport.send({ jsonrpc: '2.0', method: 'ping' });

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    );
    expect(transport.stats.messagesSent).toBe(1);
  });

  it('closes gracefully', async () => {
    const connectPromise = transport.connect(target);
    const mockWs = MockWebSocket.lastInstance!;
    mockWs.simulateOpen();
    await connectPromise;

    await transport.close();
    expect(mockWs.close).toHaveBeenCalledWith(1000, 'Normal closure');
    expect(transport.state).toBe('disconnected');
  });

  it('emits message events when receiving data', async () => {
    const connectPromise = transport.connect(target);
    const mockWs = MockWebSocket.lastInstance!;
    mockWs.simulateOpen();
    await connectPromise;

    const messageHandler = jest.fn();
    transport.on('message', messageHandler);

    mockWs.simulateMessage(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ok' }));

    expect(messageHandler).toHaveBeenCalledWith({ jsonrpc: '2.0', id: 1, result: 'ok' });
    expect(transport.stats.messagesReceived).toBe(1);
  });
});
