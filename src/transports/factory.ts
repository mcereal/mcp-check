/**
 * Transport factory for creating transport instances
 */

import { Transport, TransportFactory } from '../types/transport';
import { Target } from '../types/config';
import { StdioTransport } from './stdio';
import { TcpTransport } from './tcp';
import { WebSocketTransport } from './websocket';

/**
 * Default transport factory implementation
 */
export class DefaultTransportFactory implements TransportFactory {
  private transportMap = new Map<string, () => Transport>([
    ['stdio', () => new StdioTransport()],
    ['tcp', () => new TcpTransport()],
    ['websocket', () => new WebSocketTransport()],
  ]);

  create(target: Target): Transport {
    const creator = this.transportMap.get(target.type);
    if (!creator) {
      throw new Error(`Unsupported transport type: ${target.type}`);
    }

    return creator();
  }

  supports(type: string): boolean {
    return this.transportMap.has(type);
  }

  /**
   * Register a custom transport type
   */
  register(type: string, creator: () => Transport): void {
    this.transportMap.set(type, creator);
  }

  /**
   * Get list of supported transport types
   */
  getSupportedTypes(): string[] {
    return Array.from(this.transportMap.keys());
  }
}
