/**
 * MCP client implementation
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { Transport as SDKTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
// Import type schemas and infer types from them
import {
  ToolSchema,
  ResourceSchema,
  PromptSchema,
  CallToolResultSchema,
  GetPromptResultSchema,
  TextContentSchema,
  ImageContentSchema,
  ContentBlockSchema,
  ClientCapabilitiesSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { Logger } from '../types/reporting';
import { Target } from '../types/config';
import { Transport } from '../types/transport';

// Infer types from Zod schemas
type Tool = z.infer<typeof ToolSchema>;
type Resource = z.infer<typeof ResourceSchema>;
type Prompt = z.infer<typeof PromptSchema>;
type CallToolResult = z.infer<typeof CallToolResultSchema>;
type GetPromptResult = z.infer<typeof GetPromptResultSchema>;
type ContentBlock = z.infer<typeof ContentBlockSchema>;

/**
 * Adapter to bridge your custom transport interface with SDK transport
 */
class TransportAdapter implements SDKTransport {
  constructor(private customTransport: Transport) {}

  async start(): Promise<void> {
    // Your transports auto-connect, so this is a no-op
  }

  async send(message: any): Promise<void> {
    return this.customTransport.send(message);
  }

  async close(): Promise<void> {
    return this.customTransport.close();
  }

  onclose?: () => void;
  onmessage?: (message: any) => void;
  onerror?: (error: Error) => void;
}

/**
 * MCP client implementation using the official SDK
 */
export class MCPTestClient {
  private client: Client;
  private sdkTransport?: SDKTransport;
  private initialized = false;
  private notificationHandlers: ((message: any) => void)[] = [];

  constructor(
    private logger: Logger,
    private clientInfo = { name: 'mcp-check', version: '1.0.0' },
  ) {
    this.client = new Client(this.clientInfo, {
      capabilities: {
        experimental: {},
        sampling: {},
        roots: {
          listChanged: true,
        },
      },
    });
  }

  /**
   * Initialize with custom transport
   */
  async initialize(transport?: any, capabilities?: any): Promise<any> {
    if (this.initialized) {
      throw new Error('Client is already initialized');
    }

    // If transport is provided, use it as a custom transport
    if (transport) {
      await this.connectWithCustomTransport(transport);
    }

    // Connect using the SDK
    if (!this.sdkTransport) {
      throw new Error('No transport configured');
    }

    try {
      await this.client.connect(this.sdkTransport);
      this.initialized = true;

      this.logger.info('MCP client initialized using SDK', {
        serverCapabilities: this.client.getServerCapabilities(),
        serverVersion: this.client.getServerVersion(),
      });

      // Mock response for testing compatibility
      return {
        jsonrpc: '2.0',
        id: 'init-' + Date.now(),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: this.client.getServerCapabilities(),
          serverInfo: this.client.getServerVersion(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to initialize MCP client', { error });
      throw error;
    }
  }

  /**
   * Add notification handler
   */
  onNotification(handler: (message: any) => void): void {
    this.notificationHandlers.push(handler);
  }

  private emitNotification(message: any): void {
    for (const handler of this.notificationHandlers) {
      handler(message);
    }
  }

  /**
   * Create SDK transport directly from target configuration
   */
  async connectFromTarget(target: Target): Promise<void> {
    switch (target.type) {
      case 'stdio':
        this.sdkTransport = new StdioClientTransport({
          command: target.command,
          args: target.args || [],
          env: target.env,
        });
        break;

      case 'websocket':
        this.sdkTransport = new WebSocketClientTransport(new URL(target.url));
        break;

      case 'tcp':
        // TCP transport not directly supported by SDK, use adapter
        throw new Error('TCP transport requires custom transport adapter');

      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = target;
        throw new Error(
          `Unsupported target type: ${JSON.stringify(_exhaustive)}`,
        );
    }

    await this.connect();
  }

  /**
   * Connect using custom transport (with adapter)
   */
  async connectWithCustomTransport(transport: Transport): Promise<void> {
    // Bridge your custom transport to SDK transport interface
    this.sdkTransport = new TransportAdapter(transport);

    // Setup event bridging
    transport.on('message', (message) => {
      // Handle notifications
      if (message && !message.id && message.method) {
        this.emitNotification(message);
      }

      if (this.sdkTransport?.onmessage) {
        this.sdkTransport.onmessage(message);
      }
    });

    transport.on('error', (error) => {
      if (this.sdkTransport?.onerror) {
        this.sdkTransport.onerror(error);
      }
    });

    transport.on('close', () => {
      if (this.sdkTransport?.onclose) {
        this.sdkTransport.onclose();
      }
    });

    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.sdkTransport) {
      throw new Error('No transport configured');
    }

    try {
      await this.client.connect(this.sdkTransport);
      this.initialized = true;

      this.logger.info('MCP client initialized using SDK', {
        serverCapabilities: this.client.getServerCapabilities(),
        serverVersion: this.client.getServerVersion(),
      });
    } catch (error) {
      this.logger.error('Failed to initialize MCP client', { error });
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Tool[]> {
    this.ensureInitialized();
    const result = await this.client.listTools();
    return result.tools || [];
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args?: any): Promise<CallToolResult> {
    this.ensureInitialized();
    return await this.client.callTool({ name, arguments: args });
  }

  /**
   * List available resources
   */
  async listResources(): Promise<Resource[]> {
    this.ensureInitialized();
    const result = await this.client.listResources();
    return result.resources || [];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<ContentBlock[]> {
    this.ensureInitialized();
    const result = await this.client.readResource({ uri });
    return result.contents || [];
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<Prompt[]> {
    this.ensureInitialized();
    const result = await this.client.listPrompts();
    return result.prompts || [];
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: any): Promise<GetPromptResult> {
    this.ensureInitialized();
    return await this.client.getPrompt({ name, arguments: args });
  }

  /**
   * Send a ping
   */
  async ping(): Promise<void> {
    this.ensureInitialized();
    await this.client.ping();
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.sdkTransport) {
      await this.sdkTransport.close();
    }
    this.initialized = false;
    this.logger.info('MCP SDK client closed');
  }

  /**
   * Get server capabilities
   */
  getServerCapabilities() {
    return this.client.getServerCapabilities();
  }

  /**
   * Get server version info
   */
  getServerVersion() {
    return this.client.getServerVersion();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Client not initialized. Call connectFromTarget() or connectWithCustomTransport() first.',
      );
    }
  }
}
