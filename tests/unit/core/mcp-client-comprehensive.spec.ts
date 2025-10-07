/**
 * Comprehensive unit tests for MCPTestClient
 */

import { MCPTestClient } from '../../../src/core/mcp-client';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@modelcontextprotocol/sdk/client/stdio.js');
jest.mock('@modelcontextprotocol/sdk/client/websocket.js');

describe('MCPTestClient', () => {
  let client: MCPTestClient;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<Transport>;
  let mockSDKClient: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockTransport = {
      connect: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    mockSDKClient = {
      connect: jest.fn(),
      listTools: jest.fn(),
      callTool: jest.fn(),
      listResources: jest.fn(),
      readResource: jest.fn(),
      listPrompts: jest.fn(),
      getPrompt: jest.fn(),
      ping: jest.fn(),
      getServerCapabilities: jest.fn(),
      getServerVersion: jest.fn(),
    };

    // Mock the SDK Client constructor
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    Client.mockImplementation(() => mockSDKClient);

    client = new MCPTestClient(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    it('should create instance with default client info', () => {
      const testClient = new MCPTestClient(mockLogger);
      expect(testClient).toBeInstanceOf(MCPTestClient);
    });

    it('should create instance with custom client info', () => {
      const customClientInfo = { name: 'custom-client', version: '2.0.0' };
      const testClient = new MCPTestClient(mockLogger, customClientInfo);
      expect(testClient).toBeInstanceOf(MCPTestClient);
    });
  });

  describe('Transport Connection', () => {
    describe('connectFromTarget', () => {
      it('should connect using stdio transport', async () => {
        const {
          StdioClientTransport,
        } = require('@modelcontextprotocol/sdk/client/stdio.js');
        StdioClientTransport.mockImplementation(() => ({}));
        mockSDKClient.connect.mockResolvedValue(undefined);
        mockSDKClient.getServerCapabilities.mockReturnValue({});
        mockSDKClient.getServerVersion.mockReturnValue({});

        const target = {
          type: 'stdio' as const,
          command: 'test-command',
          args: ['--arg1', '--arg2'],
          env: { TEST_VAR: 'test' },
        };

        await client.connectFromTarget(target);

        expect(StdioClientTransport).toHaveBeenCalledWith({
          command: 'test-command',
          args: ['--arg1', '--arg2'],
          env: { TEST_VAR: 'test' },
        });
        expect(mockSDKClient.connect).toHaveBeenCalled();
      });

      it('should connect using websocket transport', async () => {
        const {
          WebSocketClientTransport,
        } = require('@modelcontextprotocol/sdk/client/websocket.js');
        WebSocketClientTransport.mockImplementation(() => ({}));
        mockSDKClient.connect.mockResolvedValue(undefined);
        mockSDKClient.getServerCapabilities.mockReturnValue({});
        mockSDKClient.getServerVersion.mockReturnValue({});

        const target = {
          type: 'websocket' as const,
          url: 'ws://localhost:8080',
        };

        await client.connectFromTarget(target);

        expect(WebSocketClientTransport).toHaveBeenCalledWith(
          new URL('ws://localhost:8080'),
        );
        expect(mockSDKClient.connect).toHaveBeenCalled();
      });

      it('should throw error for TCP transport', async () => {
        const target = {
          type: 'tcp' as const,
          host: 'localhost',
          port: 8080,
        };

        await expect(client.connectFromTarget(target)).rejects.toThrow(
          'TCP transport requires custom transport adapter',
        );
      });

      it('should throw error for unsupported transport types', async () => {
        const target = {
          type: 'unsupported' as any,
        };

        await expect(client.connectFromTarget(target)).rejects.toThrow(
          'Unsupported target type',
        );
      });

      it('should handle connection failures', async () => {
        const {
          StdioClientTransport,
        } = require('@modelcontextprotocol/sdk/client/stdio.js');
        StdioClientTransport.mockImplementation(() => ({}));
        mockSDKClient.connect.mockRejectedValue(new Error('Connection failed'));

        const target = {
          type: 'stdio' as const,
          command: 'test-command',
        };

        await expect(client.connectFromTarget(target)).rejects.toThrow(
          'Connection failed',
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to initialize MCP client',
          { error: expect.any(Error) },
        );
      });
    });

    describe('connectWithCustomTransport', () => {
      it('should connect using custom transport adapter', async () => {
        mockSDKClient.connect.mockResolvedValue(undefined);
        mockSDKClient.getServerCapabilities.mockReturnValue({});
        mockSDKClient.getServerVersion.mockReturnValue({});

        await client.connectWithCustomTransport(mockTransport);

        expect(mockSDKClient.connect).toHaveBeenCalled();
        expect(mockTransport.on).toHaveBeenCalledWith(
          'message',
          expect.any(Function),
        );
        expect(mockTransport.on).toHaveBeenCalledWith(
          'error',
          expect.any(Function),
        );
        expect(mockTransport.on).toHaveBeenCalledWith(
          'close',
          expect.any(Function),
        );
      });

      it('should handle transport events correctly', async () => {
        mockSDKClient.connect.mockResolvedValue(undefined);
        mockSDKClient.getServerCapabilities.mockReturnValue({});
        mockSDKClient.getServerVersion.mockReturnValue({});

        let messageHandler: (message: any) => void;
        let errorHandler: (error: Error) => void;
        let closeHandler: () => void;

        mockTransport.on.mockImplementation((event, handler) => {
          if (event === 'message') messageHandler = handler;
          if (event === 'error') errorHandler = handler;
          if (event === 'close') closeHandler = handler;
        });

        await client.connectWithCustomTransport(mockTransport);

        // Test message handling
        const testMessage = { method: 'test', params: {} };
        messageHandler!(testMessage);

        // Test error handling
        const testError = new Error('Test error');
        errorHandler!(testError);

        // Test close handling
        closeHandler!();

        // Verify handlers were set up
        expect(mockTransport.on).toHaveBeenCalledTimes(3);
      });

      it('should handle custom transport connection failures', async () => {
        mockSDKClient.connect.mockRejectedValue(new Error('Transport failed'));

        await expect(
          client.connectWithCustomTransport(mockTransport),
        ).rejects.toThrow('Transport failed');
      });
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});
      await client.connectFromTarget({
        type: 'stdio',
        command: 'test',
      });
    });

    describe('listTools', () => {
      it('should list tools successfully', async () => {
        const mockTools = [
          {
            name: 'test-tool',
            description: 'A test tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ];
        mockSDKClient.listTools.mockResolvedValue({ tools: mockTools });

        const result = await client.listTools();

        expect(result).toEqual(mockTools);
        expect(mockSDKClient.listTools).toHaveBeenCalled();
      });

      it('should return empty array when no tools available', async () => {
        mockSDKClient.listTools.mockResolvedValue({});

        const result = await client.listTools();

        expect(result).toEqual([]);
      });

      it('should handle listTools errors', async () => {
        mockSDKClient.listTools.mockRejectedValue(
          new Error('List tools failed'),
        );

        await expect(client.listTools()).rejects.toThrow('List tools failed');
      });
    });

    describe('callTool', () => {
      it('should call tool successfully', async () => {
        const mockResult = {
          content: [{ type: 'text', text: 'Tool result' }],
        };
        mockSDKClient.callTool.mockResolvedValue(mockResult);

        const result = await client.callTool('test-tool', { param: 'value' });

        expect(result).toEqual(mockResult);
        expect(mockSDKClient.callTool).toHaveBeenCalledWith({
          name: 'test-tool',
          arguments: { param: 'value' },
        });
      });

      it('should call tool without arguments', async () => {
        const mockResult = {
          content: [{ type: 'text', text: 'Tool result' }],
        };
        mockSDKClient.callTool.mockResolvedValue(mockResult);

        const result = await client.callTool('test-tool');

        expect(result).toEqual(mockResult);
        expect(mockSDKClient.callTool).toHaveBeenCalledWith({
          name: 'test-tool',
          arguments: undefined,
        });
      });

      it('should handle callTool errors', async () => {
        mockSDKClient.callTool.mockRejectedValue(new Error('Tool call failed'));

        await expect(client.callTool('test-tool')).rejects.toThrow(
          'Tool call failed',
        );
      });
    });
  });

  describe('Resource Operations', () => {
    beforeEach(async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});
      await client.connectFromTarget({
        type: 'stdio',
        command: 'test',
      });
    });

    describe('listResources', () => {
      it('should list resources successfully', async () => {
        const mockResources = [
          {
            uri: 'file://test.txt',
            name: 'Test Resource',
            description: 'A test resource',
          },
        ];
        mockSDKClient.listResources.mockResolvedValue({
          resources: mockResources,
        });

        const result = await client.listResources();

        expect(result).toEqual(mockResources);
        expect(mockSDKClient.listResources).toHaveBeenCalled();
      });

      it('should return empty array when no resources available', async () => {
        mockSDKClient.listResources.mockResolvedValue({});

        const result = await client.listResources();

        expect(result).toEqual([]);
      });
    });

    describe('readResource', () => {
      it('should read resource successfully', async () => {
        const mockContent = [{ type: 'text', text: 'Resource content' }];
        mockSDKClient.readResource.mockResolvedValue({
          contents: mockContent,
        });

        const result = await client.readResource('file://test.txt');

        expect(result).toEqual(mockContent);
        expect(mockSDKClient.readResource).toHaveBeenCalledWith({
          uri: 'file://test.txt',
        });
      });

      it('should return empty array when no content available', async () => {
        mockSDKClient.readResource.mockResolvedValue({});

        const result = await client.readResource('file://test.txt');

        expect(result).toEqual([]);
      });
    });
  });

  describe('Prompt Operations', () => {
    beforeEach(async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});
      await client.connectFromTarget({
        type: 'stdio',
        command: 'test',
      });
    });

    describe('listPrompts', () => {
      it('should list prompts successfully', async () => {
        const mockPrompts = [
          {
            name: 'test-prompt',
            description: 'A test prompt',
            arguments: [],
          },
        ];
        mockSDKClient.listPrompts.mockResolvedValue({
          prompts: mockPrompts,
        });

        const result = await client.listPrompts();

        expect(result).toEqual(mockPrompts);
        expect(mockSDKClient.listPrompts).toHaveBeenCalled();
      });
    });

    describe('getPrompt', () => {
      it('should get prompt successfully', async () => {
        const mockResult = {
          description: 'Generated prompt',
          messages: [
            { role: 'user', content: { type: 'text', text: 'Hello' } },
          ],
        };
        mockSDKClient.getPrompt.mockResolvedValue(mockResult);

        const result = await client.getPrompt('test-prompt', {
          param: 'value',
        });

        expect(result).toEqual(mockResult);
        expect(mockSDKClient.getPrompt).toHaveBeenCalledWith({
          name: 'test-prompt',
          arguments: { param: 'value' },
        });
      });
    });
  });

  describe('Utility Operations', () => {
    beforeEach(async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});
      await client.connectFromTarget({
        type: 'stdio',
        command: 'test',
      });
    });

    describe('ping', () => {
      it('should ping successfully', async () => {
        mockSDKClient.ping.mockResolvedValue(undefined);

        await client.ping();

        expect(mockSDKClient.ping).toHaveBeenCalled();
      });

      it('should handle ping failures', async () => {
        mockSDKClient.ping.mockRejectedValue(new Error('Ping failed'));

        await expect(client.ping()).rejects.toThrow('Ping failed');
      });
    });

    describe('getServerCapabilities', () => {
      it('should return server capabilities', () => {
        const mockCapabilities = { tools: {}, resources: {} };
        mockSDKClient.getServerCapabilities.mockReturnValue(mockCapabilities);

        const result = client.getServerCapabilities();

        expect(result).toEqual(mockCapabilities);
      });
    });

    describe('getServerVersion', () => {
      it('should return server version', () => {
        const mockVersion = { name: 'test-server', version: '1.0.0' };
        mockSDKClient.getServerVersion.mockReturnValue(mockVersion);

        const result = client.getServerVersion();

        expect(result).toEqual(mockVersion);
      });
    });
  });

  describe('Connection Management', () => {
    it('should prevent operations before initialization', async () => {
      await expect(client.listTools()).rejects.toThrow(
        'Client not initialized',
      );
      await expect(client.callTool('test')).rejects.toThrow(
        'Client not initialized',
      );
      await expect(client.listResources()).rejects.toThrow(
        'Client not initialized',
      );
      await expect(client.readResource('test')).rejects.toThrow(
        'Client not initialized',
      );
      await expect(client.listPrompts()).rejects.toThrow(
        'Client not initialized',
      );
      await expect(client.getPrompt('test')).rejects.toThrow(
        'Client not initialized',
      );
      await expect(client.ping()).rejects.toThrow('Client not initialized');
    });

    it('should close connection properly', async () => {
      const mockTransport = { close: jest.fn() };
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});

      // Connect first
      await client.connectFromTarget({
        type: 'stdio',
        command: 'test',
      });

      await client.close();

      expect(mockLogger.info).toHaveBeenCalledWith('MCP SDK client closed');
    });

    it('should handle close when not connected', async () => {
      await client.close();

      expect(mockLogger.info).toHaveBeenCalledWith('MCP SDK client closed');
    });
  });

  describe('Notification Handling', () => {
    it('should register notification handlers', () => {
      const handler = jest.fn();
      client.onNotification(handler);

      // Verify handler is registered (we can't test this directly without private access)
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle notifications from custom transport', async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});

      const handler = jest.fn();
      client.onNotification(handler);

      let messageHandler: (message: any) => void;
      mockTransport.on.mockImplementation((event, handlerFn) => {
        if (event === 'message') messageHandler = handlerFn;
      });

      await client.connectWithCustomTransport(mockTransport);

      // Simulate a notification message
      const notification = { method: 'notification', params: {} };
      messageHandler!(notification);

      expect(handler).toHaveBeenCalledWith(notification);
    });

    it('should not treat regular responses as notifications', async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});

      const handler = jest.fn();
      client.onNotification(handler);

      let messageHandler: (message: any) => void;
      mockTransport.on.mockImplementation((event, handlerFn) => {
        if (event === 'message') messageHandler = handlerFn;
      });

      await client.connectWithCustomTransport(mockTransport);

      // Simulate a regular response (has id)
      const response = { id: 1, result: {} };
      messageHandler!(response);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Initialization with Legacy Interface', () => {
    it('should support legacy initialize method', async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({ tools: {} });
      mockSDKClient.getServerVersion.mockReturnValue({
        name: 'test-server',
        version: '1.0.0',
      });

      const result = await client.initialize(mockTransport);

      expect(result).toEqual({
        jsonrpc: '2.0',
        id: expect.stringMatching(/^init-\d+$/),
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'test-server', version: '1.0.0' },
        },
      });
    });

    it('should prevent double initialization', async () => {
      mockSDKClient.connect.mockResolvedValue(undefined);
      mockSDKClient.getServerCapabilities.mockReturnValue({});
      mockSDKClient.getServerVersion.mockReturnValue({});

      await client.initialize(mockTransport);

      await expect(client.initialize(mockTransport)).rejects.toThrow(
        'Client is already initialized',
      );
    });

    it('should throw when initializing without transport', async () => {
      await expect(client.initialize()).rejects.toThrow(
        'No transport configured',
      );
    });
  });
});
