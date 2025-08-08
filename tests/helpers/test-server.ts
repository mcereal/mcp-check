/**
 * Mock MCP server for testing
 */

import { EventEmitter } from 'events';
import { Transport } from '../../src/types/transport';

export interface TestServerOptions {
  name?: string;
  version?: string;
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  tools?: TestTool[];
  resources?: TestResource[];
  prompts?: TestPrompt[];
  delayMs?: number;
  shouldFailInit?: boolean;
  shouldFailTools?: boolean;
}

export interface TestTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any> | any;
}

export interface TestResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  text?: string;
}

export interface TestPrompt {
  name: string;
  description: string;
  arguments?: any[];
  handler: (args: any) => Promise<any> | any;
}

/**
 * Mock MCP server that responds to JSON-RPC messages
 */
export class MockMCPServer extends EventEmitter {
  private options: TestServerOptions;

  constructor(options: TestServerOptions = {}) {
    super();
    this.options = {
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        logging: true,
      },
      tools: [],
      resources: [],
      prompts: [],
      delayMs: 0,
      ...options,
    };
  }

  /**
   * Process an incoming JSON-RPC message and return response
   */
  async processMessage(message: any): Promise<any> {
    if (this.options.delayMs && this.options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }

    const { method, id, params } = message;

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id);
        case 'tools/list':
          return this.handleToolsList(id);
        case 'tools/call':
          return this.handleToolsCall(id, params);
        case 'resources/list':
          return this.handleResourcesList(id);
        case 'resources/read':
          return this.handleResourcesRead(id, params);
        case 'prompts/list':
          return this.handlePromptsList(id);
        case 'prompts/get':
          return this.handlePromptsGet(id, params);
        case 'ping':
          return this.handlePing(id);
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }

  private handleInitialize(id: any) {
    if (this.options.shouldFailInit) {
      throw new Error('Server initialization failed');
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: this.options.capabilities!.tools ? {} : undefined,
          resources: this.options.capabilities!.resources ? {} : undefined,
          prompts: this.options.capabilities!.prompts ? {} : undefined,
          logging: this.options.capabilities!.logging ? {} : undefined,
        },
        serverInfo: {
          name: this.options.name!,
          version: this.options.version!,
        },
      },
    };
  }

  private handleToolsList(id: any) {
    if (this.options.shouldFailTools) {
      throw new Error('Tools listing failed');
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: this.options.tools!.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      },
    };
  }

  private async handleToolsCall(id: any, params: any) {
    if (this.options.shouldFailTools) {
      throw new Error('Tool call failed');
    }

    const { name, arguments: args } = params;
    const tool = this.options.tools!.find((t) => t.name === name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const result = await tool.handler(args);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      },
    };
  }

  private handleResourcesList(id: any) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resources: this.options.resources!.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      },
    };
  }

  private handleResourcesRead(id: any, params: any) {
    const { uri } = params;
    const resource = this.options.resources!.find((r) => r.uri === uri);

    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        contents: [
          {
            type: 'text',
            text: resource.text || 'Mock resource content',
          },
        ],
      },
    };
  }

  private handlePromptsList(id: any) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        prompts: this.options.prompts!.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
      },
    };
  }

  private async handlePromptsGet(id: any, params: any) {
    const { name, arguments: args } = params;
    const prompt = this.options.prompts!.find((p) => p.name === name);

    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const result = await prompt.handler(args);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                typeof result === 'string' ? result : JSON.stringify(result),
            },
          },
        ],
      },
    };
  }

  private handlePing(id: any) {
    return {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  }

  addTool(tool: TestTool): void {
    this.options.tools!.push(tool);
  }

  addResource(resource: TestResource): void {
    this.options.resources!.push(resource);
  }

  addPrompt(prompt: TestPrompt): void {
    this.options.prompts!.push(prompt);
  }

  setShouldFailInit(shouldFail: boolean): void {
    this.options.shouldFailInit = shouldFail;
  }

  setShouldFailTools(shouldFail: boolean): void {
    this.options.shouldFailTools = shouldFail;
  }

  setDelayMs(delayMs: number): void {
    this.options.delayMs = delayMs;
  }
}

/**
 * Mock transport that uses the mock server
 */
export class MockTransport extends EventEmitter {
  private _state: 'disconnected' | 'connecting' | 'connected' | 'error' =
    'disconnected';
  private _stats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesTransferred: 0,
    connectionTime: 0,
  };
  private server: MockMCPServer;

  constructor(server?: MockMCPServer) {
    super();
    this.server = server || createMockServer();
  }

  get type(): 'stdio' | 'tcp' | 'websocket' {
    return 'stdio';
  }

  get state() {
    return this._state;
  }

  get stats() {
    return { ...this._stats };
  }

  async connect(target: any): Promise<void> {
    this._state = 'connecting';
    this.emit('state-change', 'connecting');

    await new Promise((resolve) => setTimeout(resolve, 10));

    this._state = 'connected';
    this.emit('state-change', 'connected');
    this.emit('connect');
  }

  async send(message: any): Promise<void> {
    if (this._state !== 'connected') {
      throw new Error('Transport not connected');
    }

    this._stats.messagesSent++;
    this._stats.bytesTransferred += JSON.stringify(message).length;

    const response = await this.server.processMessage(message);

    setTimeout(() => {
      this._stats.messagesReceived++;
      this._stats.bytesTransferred += JSON.stringify(response).length;
      this.emit('message', response);
    }, 5);
  }

  async close(): Promise<void> {
    this._state = 'disconnected';
    this.emit('state-change', 'disconnected');
    this.emit('close');
  }

  async waitForMessage(
    predicate: (message: any) => boolean,
    timeoutMs?: number,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            reject(new Error('Timeout waiting for message'));
          }, timeoutMs)
        : null;

      const messageHandler = (message: any) => {
        if (predicate(message)) {
          if (timer) clearTimeout(timer);
          this.off('message', messageHandler);
          resolve(message);
        }
      };

      this.on('message', messageHandler);
    });
  }

  getMockServer(): MockMCPServer {
    return this.server;
  }
}

/**
 * Create a mock server with common tools and resources
 */
export function createMockServer(
  options: TestServerOptions = {},
): MockMCPServer {
  const server = new MockMCPServer(options);

  // Add some default tools
  server.addTool({
    name: 'echo',
    description: 'Echo the input back',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    handler: async (args) => {
      return { echo: args.message };
    },
  });

  server.addTool({
    name: 'add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    },
    handler: async (args) => {
      return { result: args.a + args.b };
    },
  });

  // Add some default resources
  server.addResource({
    uri: 'test://resource1',
    name: 'Test Resource 1',
    description: 'A test resource',
    mimeType: 'text/plain',
    text: 'This is test resource content',
  });

  // Add some default prompts
  server.addPrompt({
    name: 'greeting',
    description: 'Generate a greeting',
    arguments: [
      {
        name: 'name',
        description: 'Name to greet',
        required: true,
      },
    ],
    handler: async (args) => {
      return `Hello, ${args.name || 'World'}!`;
    },
  });

  return server;
}
