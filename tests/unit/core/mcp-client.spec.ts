/**
 * Unit tests for MCPTestClient
 */

import { MCPTestClient } from '../../../src/core/mcp-client';
import { Transport } from '../../../src/types/transport';
import { Logger } from '../../../src/types/reporting';
import { EventEmitter } from 'events';

describe('MCPTestClient', () => {
  let client: MCPTestClient;
  let mockTransport: jest.Mocked<Transport> & EventEmitter;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockTransport = new EventEmitter() as jest.Mocked<Transport> & EventEmitter;
    // Use Object.defineProperty to set readonly properties
    Object.defineProperty(mockTransport, 'type', { value: 'stdio' });
    Object.defineProperty(mockTransport, 'state', { value: 'connected' });
    Object.defineProperty(mockTransport, 'stats', {
      value: {
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
      },
    });

    mockTransport.connect = jest.fn();
    mockTransport.send = jest.fn().mockResolvedValue(undefined);
    mockTransport.close = jest.fn().mockResolvedValue(undefined);
    mockTransport.waitForMessage = jest.fn();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue(mockLogger),
    };

    client = new MCPTestClient(mockTransport, mockLogger, 5000);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with transport and logger', () => {
      expect(client).toBeDefined();
      expect(mockTransport.send).toBeDefined();
    });

    it('should set up transport listeners', () => {
      const eventNames = mockTransport.eventNames();
      expect(eventNames).toContain('message');
      expect(eventNames).toContain('error');
      expect(eventNames).toContain('close');
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'test-server',
            version: '1.0.0',
          },
        },
      };

      // Simulate response
      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      const result = await client.initialize();

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'initialize',
        id: expect.any(String),
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'mcp-check',
            version: expect.any(String),
          },
        },
      });

      expect(result).toEqual(initResponse);
    });

    it('should initialize with custom capabilities', async () => {
      const capabilities = {
        experimental: { custom: true },
        roots: { listChanged: true },
      };

      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize(capabilities);

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'initialize',
        id: expect.any(String),
        params: {
          protocolVersion: '2024-11-05',
          capabilities,
          clientInfo: {
            name: 'mcp-check',
            version: expect.any(String),
          },
        },
      });
    });

    it('should handle initialization errors', async () => {
      const errorResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        error: {
          code: -32603,
          message: 'Initialization failed',
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', errorResponse);
      }, 10);

      await expect(client.initialize()).rejects.toThrow(
        'Initialization failed',
      );
    });

    it('should timeout initialization', async () => {
      const quickClient = new MCPTestClient(mockTransport, mockLogger, 100);

      // Don't send response to trigger timeout
      await expect(quickClient.initialize()).rejects.toThrow('Request timeout');
    });

    it('should not initialize twice', async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize();

      // Second initialization should fail
      await expect(client.initialize()).rejects.toThrow(
        'Client is already initialized',
      );
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize();
      jest.clearAllMocks(); // Clear initialization calls
    });

    it('should list tools successfully', async () => {
      const toolsResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          tools: [
            {
              name: 'test-tool',
              description: 'A test tool',
              inputSchema: {
                type: 'object',
                properties: {
                  input: { type: 'string' },
                },
              },
            },
          ],
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', toolsResponse);
      }, 10);

      const tools = await client.listTools();

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: expect.any(String),
        params: {},
      });

      expect(tools).toEqual(toolsResponse.result.tools);
    });

    it('should call tools successfully', async () => {
      const toolCallResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          content: [
            {
              type: 'text',
              text: 'Tool executed successfully',
            },
          ],
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', toolCallResponse);
      }, 10);

      const result = await client.callTool('test-tool', { input: 'test' });

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: expect.any(String),
        params: {
          name: 'test-tool',
          arguments: { input: 'test' },
        },
      });

      expect(result).toEqual(toolCallResponse.result);
    });

    it('should handle tool call errors', async () => {
      const errorResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        error: {
          code: -32602,
          message: 'Invalid tool arguments',
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', errorResponse);
      }, 10);

      await expect(
        client.callTool('test-tool', { invalid: 'args' }),
      ).rejects.toThrow('Invalid tool arguments');
    });
  });

  describe('Resource Operations', () => {
    beforeEach(async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { resources: {} },
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize();
      jest.clearAllMocks();
    });

    it('should list resources successfully', async () => {
      const resourcesResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          resources: [
            {
              uri: 'file:///test.txt',
              name: 'Test File',
              description: 'A test file',
              mimeType: 'text/plain',
            },
          ],
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', resourcesResponse);
      }, 10);

      const resources = await client.listResources();

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'resources/list',
        id: expect.any(String),
        params: {},
      });

      expect(resources).toEqual(resourcesResponse.result.resources);
    });

    it('should read resources successfully', async () => {
      const resourceResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          contents: [
            {
              uri: 'file:///test.txt',
              mimeType: 'text/plain',
              text: 'Hello, world!',
            },
          ],
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', resourceResponse);
      }, 10);

      const content = await client.readResource('file:///test.txt');

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'resources/read',
        id: expect.any(String),
        params: {
          uri: 'file:///test.txt',
        },
      });

      expect(content).toEqual(resourceResponse.result);
    });
  });

  describe('Prompt Operations', () => {
    beforeEach(async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { prompts: {} },
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize();
      jest.clearAllMocks();
    });

    it('should list prompts successfully', async () => {
      const promptsResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          prompts: [
            {
              name: 'test-prompt',
              description: 'A test prompt',
              arguments: [
                {
                  name: 'input',
                  description: 'Input text',
                  required: true,
                },
              ],
            },
          ],
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', promptsResponse);
      }, 10);

      const prompts = await client.listPrompts();

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'prompts/list',
        id: expect.any(String),
        params: {},
      });

      expect(prompts).toEqual(promptsResponse.result.prompts);
    });

    it('should get prompts successfully', async () => {
      const promptResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          description: 'Generated prompt',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'Test prompt content',
              },
            },
          ],
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', promptResponse);
      }, 10);

      const result = await client.getPrompt('test-prompt', { input: 'test' });

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'prompts/get',
        id: expect.any(String),
        params: {
          name: 'test-prompt',
          arguments: { input: 'test' },
        },
      });

      expect(result).toEqual(promptResponse.result);
    });
  });

  describe('Ping Operation', () => {
    beforeEach(async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize();
      jest.clearAllMocks();
    });

    it('should ping successfully', async () => {
      const pingResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {},
      };

      setTimeout(() => {
        mockTransport.emit('message', pingResponse);
      }, 10);

      await client.ping();

      expect(mockTransport.send).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'ping',
        id: expect.any(String),
        params: {},
      });
    });
  });

  describe('Notification Handling', () => {
    beforeEach(async () => {
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await client.initialize();
    });

    it('should handle notifications', () => {
      const notificationHandler = jest.fn();
      client.onNotification(notificationHandler);

      const notification = {
        jsonrpc: '2.0',
        method: 'notification/test',
        params: { data: 'test' },
      };

      mockTransport.emit('message', notification);

      expect(notificationHandler).toHaveBeenCalledWith(notification);
    });

    it('should handle multiple notification handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      client.onNotification(handler1);
      client.onNotification(handler2);

      const notification = {
        jsonrpc: '2.0',
        method: 'notification/test',
        params: { data: 'test' },
      };

      mockTransport.emit('message', notification);

      expect(handler1).toHaveBeenCalledWith(notification);
      expect(handler2).toHaveBeenCalledWith(notification);
    });
  });

  describe('Error Handling', () => {
    it('should handle transport errors during requests', async () => {
      const requestPromise = client.ping();

      // Emit error before response
      mockTransport.emit('error', new Error('Transport failed'));

      await expect(requestPromise).rejects.toThrow('Transport failed');
    });

    it('should handle transport close during requests', async () => {
      const requestPromise = client.ping();

      // Emit close before response
      mockTransport.emit('close');

      await expect(requestPromise).rejects.toThrow('Transport closed');
    });
  });

  describe('Cleanup', () => {
    it('should close transport on client close', async () => {
      await client.close();

      expect(mockTransport.close).toHaveBeenCalled();
    });

    it('should cancel pending requests on close', async () => {
      const requestPromise = client.ping();

      await client.close();

      await expect(requestPromise).rejects.toThrow('Client closed');
    });
  });

  describe('Request Timeout', () => {
    it('should timeout requests after specified time', async () => {
      const quickClient = new MCPTestClient(mockTransport, mockLogger, 100);

      // Initialize first
      const initResponse = {
        jsonrpc: '2.0',
        id: expect.any(String),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      };

      setTimeout(() => {
        mockTransport.emit('message', initResponse);
      }, 10);

      await quickClient.initialize();

      // Now test timeout
      const requestPromise = quickClient.ping();

      await expect(requestPromise).rejects.toThrow('Request timeout');
    });
  });
});
