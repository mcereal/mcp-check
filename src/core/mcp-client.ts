/**
 * MCP client implementation for testing
 */

import { v4 as uuidv4 } from 'uuid';
import { Transport } from '../types/transport';
import { Logger } from '../types/reporting';
import {
  MCPClient,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPInitializeRequest,
  MCPInitializeResponse,
  MCPClientCapabilities,
  MCPTool,
  MCPToolCallRequest,
  MCPToolCallResponse,
  MCPResource,
  MCPPrompt,
  MCPContent,
} from '../types/mcp';

/**
 * MCP client implementation
 */
export class MCPTestClient implements MCPClient {
  private requestMap = new Map<
    string | number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private notificationHandlers: ((notification: MCPNotification) => void)[] =
    [];
  private initialized = false;

  constructor(
    private transport: Transport,
    private logger: Logger,
    private defaultTimeout: number = 15000,
  ) {
    this.setupTransportListeners();
  }

  async initialize(
    capabilities?: MCPClientCapabilities,
  ): Promise<MCPInitializeResponse> {
    if (this.initialized) {
      throw new Error('Client already initialized');
    }

    const request: MCPInitializeRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: capabilities || {
          experimental: {},
          sampling: {},
          roots: {
            listChanged: true,
          },
        },
        clientInfo: {
          name: 'mcp-check',
          version: '1.0.0',
        },
      },
    };

    const response = await this.sendRequest<MCPInitializeResponse>(request);

    // Send initialized notification
    await this.sendNotification({
      jsonrpc: '2.0',
      method: 'initialized',
    });

    this.initialized = true;
    this.logger.info('MCP client initialized', {
      serverVersion: response.result.serverInfo.version,
      protocolVersion: response.result.protocolVersion,
    });

    return response;
  }

  async listTools(): Promise<MCPTool[]> {
    this.ensureInitialized();

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tools/list',
    };

    const response = await this.sendRequest<{ tools: MCPTool[] }>(request);
    return response.tools || [];
  }

  async callTool(name: string, args?: any): Promise<MCPToolCallResponse> {
    this.ensureInitialized();

    const request: MCPToolCallRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    return await this.sendRequest<MCPToolCallResponse>(request);
  }

  async listResources(): Promise<MCPResource[]> {
    this.ensureInitialized();

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'resources/list',
    };

    const response = await this.sendRequest<{ resources: MCPResource[] }>(
      request,
    );
    return response.resources || [];
  }

  async readResource(uri: string): Promise<MCPContent[]> {
    this.ensureInitialized();

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'resources/read',
      params: { uri },
    };

    const response = await this.sendRequest<{ contents: MCPContent[] }>(
      request,
    );
    return response.contents || [];
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureInitialized();

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'prompts/list',
    };

    const response = await this.sendRequest<{ prompts: MCPPrompt[] }>(request);
    return response.prompts || [];
  }

  async getPrompt(name: string, args?: any): Promise<MCPContent[]> {
    this.ensureInitialized();

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'prompts/get',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await this.sendRequest<{ messages: MCPContent[] }>(
      request,
    );
    return response.messages || [];
  }

  async ping(): Promise<void> {
    this.ensureInitialized();

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'ping',
    };

    await this.sendRequest(request);
  }

  async close(): Promise<void> {
    // Clear any pending requests
    for (const [id, { reject, timeout }] of this.requestMap) {
      clearTimeout(timeout);
      reject(new Error('Client closed'));
    }
    this.requestMap.clear();

    await this.transport.close();
    this.initialized = false;
    this.logger.info('MCP client closed');
  }

  onNotification(handler: (notification: MCPNotification) => void): void {
    this.notificationHandlers.push(handler);
  }

  private async sendRequest<T = any>(
    request: MCPRequest,
    timeout?: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = timeout || this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.requestMap.delete(request.id);
        reject(
          new Error(`Request timeout after ${timeoutMs}ms: ${request.method}`),
        );
      }, timeoutMs);

      this.requestMap.set(request.id, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      this.transport.send(request).catch((error) => {
        this.requestMap.delete(request.id);
        clearTimeout(timeoutHandle);
        reject(error);
      });

      this.logger.debug('Sent MCP request', {
        id: request.id,
        method: request.method,
      });
    });
  }

  private async sendNotification(notification: MCPNotification): Promise<void> {
    await this.transport.send(notification);
    this.logger.debug('Sent MCP notification', {
      method: notification.method,
    });
  }

  private setupTransportListeners(): void {
    this.transport.on('message', (message: any) => {
      this.handleMessage(message);
    });

    this.transport.on('error', (error: Error) => {
      this.logger.error('Transport error', { error: error.message });
      // Reject all pending requests
      for (const [id, { reject, timeout }] of this.requestMap) {
        clearTimeout(timeout);
        reject(error);
      }
      this.requestMap.clear();
    });

    this.transport.on('close', () => {
      this.logger.debug('Transport closed');
      this.initialized = false;
    });
  }

  private handleMessage(message: any): void {
    this.logger.debug('Received MCP message', { message });

    // Handle responses
    if (
      message.id !== undefined &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      const pending = this.requestMap.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.requestMap.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(
              `MCP Error ${message.error.code}: ${message.error.message}`,
            ),
          );
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Handle notifications
    if (message.method && message.id === undefined) {
      const notification: MCPNotification = message;
      for (const handler of this.notificationHandlers) {
        try {
          handler(notification);
        } catch (error) {
          this.logger.error('Error in notification handler', {
            error: error.message,
          });
        }
      }
      return;
    }

    this.logger.warn('Received unknown message type', { message });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Client not initialized. Call initialize() first.');
    }
  }
}
