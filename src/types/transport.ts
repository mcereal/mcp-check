/**
 * Transport layer abstractions for different MCP connection types
 */

/**
 * Connection state
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Transport events
 */
export interface TransportEvents {
  'state-change': (state: ConnectionState) => void;
  message: (message: any) => void;
  error: (error: Error) => void;
  close: () => void;
}

/**
 * Transport statistics
 */
export interface TransportStats {
  messagesSent: number;
  messagesReceived: number;
  bytesTransferred: number;
  connectionTime?: number;
  lastMessageTime?: number;
}

/**
 * Abstract transport interface
 */
export interface Transport {
  readonly type: 'stdio' | 'tcp' | 'websocket';
  readonly state: ConnectionState;
  readonly stats: TransportStats;

  /**
   * Connect to the target
   */
  connect(target: import('./config').Target): Promise<void>;

  /**
   * Send a message
   */
  send(message: any): Promise<void>;

  /**
   * Close the connection
   */
  close(): Promise<void>;

  /**
   * Subscribe to transport events
   */
  on<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): void;

  /**
   * Unsubscribe from transport events
   */
  off<K extends keyof TransportEvents>(
    event: K,
    listener: TransportEvents[K],
  ): void;

  /**
   * Wait for a specific message or timeout
   */
  waitForMessage(
    predicate: (message: any) => boolean,
    timeoutMs?: number,
  ): Promise<any>;
}

/**
 * Stdio transport configuration
 */
export interface StdioTransportConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  shell?: boolean;
}

/**
 * TCP transport configuration
 */
export interface TcpTransportConfig {
  host: string;
  port: number;
  tls?: boolean;
  timeout?: number;
}

/**
 * WebSocket transport configuration
 */
export interface WebSocketTransportConfig {
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
}

/**
 * Transport factory interface
 */
export interface TransportFactory {
  create(target: import('./config').Target): Transport;
  supports(type: string): boolean;
}
