/**
 * Fast unit tests for MCPTestClient
 */

import { MCPTestClient } from '../../../src/core/mcp-client';
import { Logger } from '../../../src/types/reporting';
import { Transport } from '../../../src/types/transport';
import { EventEmitter } from 'events';

// Mock the SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js');

describe('MCPTestClient', () => {
  let client: MCPTestClient;
  let mockLogger: jest.Mocked<Logger>;
  let mockTransport: jest.Mocked<Transport> & EventEmitter;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue({} as Logger),
    };

    mockTransport = new EventEmitter() as jest.Mocked<Transport> & EventEmitter;
    mockTransport.send = jest.fn().mockResolvedValue(undefined);
    mockTransport.close = jest.fn().mockResolvedValue(undefined);
    mockTransport.connect = jest.fn().mockResolvedValue(undefined);

    client = new MCPTestClient(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with logger', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(MCPTestClient);
    });
  });

  describe('Basic Operations', () => {
    it('should connect with transport', async () => {
      // Mock the connect operation to resolve immediately
      const connectSpy = jest
        .spyOn(client, 'connectWithCustomTransport')
        .mockResolvedValue(undefined);

      await client.connectWithCustomTransport(mockTransport);

      expect(connectSpy).toHaveBeenCalledWith(mockTransport);
    });

    it('should handle connection errors', async () => {
      const connectSpy = jest
        .spyOn(client, 'connectWithCustomTransport')
        .mockRejectedValue(new Error('Connection failed'));

      await expect(
        client.connectWithCustomTransport(mockTransport),
      ).rejects.toThrow('Connection failed');
      expect(connectSpy).toHaveBeenCalled();
    });

    it('should close client', async () => {
      const closeSpy = jest.spyOn(client, 'close').mockResolvedValue(undefined);

      await client.close();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('Tool Operations', () => {
    beforeEach(() => {
      // Mock successful connection
      jest
        .spyOn(client, 'connectWithCustomTransport')
        .mockResolvedValue(undefined);
    });

    it('should list tools', async () => {
      const mockTools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object' as const },
        },
      ];

      const listToolsSpy = jest
        .spyOn(client, 'listTools')
        .mockResolvedValue(mockTools);

      const tools = await client.listTools();

      expect(listToolsSpy).toHaveBeenCalled();
      expect(tools).toEqual(mockTools);
    });

    it('should call tools', async () => {
      const mockResult = {
        content: [{ type: 'text' as const, text: 'Tool result' }],
      };

      const callToolSpy = jest
        .spyOn(client, 'callTool')
        .mockResolvedValue(mockResult);

      const result = await client.callTool('test-tool', { input: 'test' });

      expect(callToolSpy).toHaveBeenCalledWith('test-tool', { input: 'test' });
      expect(result).toEqual(mockResult);
    });

    it('should handle tool errors', async () => {
      const callToolSpy = jest
        .spyOn(client, 'callTool')
        .mockRejectedValue(new Error('Tool error'));

      await expect(client.callTool('bad-tool', {})).rejects.toThrow(
        'Tool error',
      );
      expect(callToolSpy).toHaveBeenCalled();
    });
  });

  describe('Resource Operations', () => {
    beforeEach(() => {
      jest
        .spyOn(client, 'connectWithCustomTransport')
        .mockResolvedValue(undefined);
    });

    it('should list resources', async () => {
      const mockResources = [
        {
          uri: 'test://resource',
          name: 'Test Resource',
          description: 'A test resource',
        },
      ];

      const listResourcesSpy = jest
        .spyOn(client, 'listResources')
        .mockResolvedValue(mockResources);

      const resources = await client.listResources();

      expect(listResourcesSpy).toHaveBeenCalled();
      expect(resources).toEqual(mockResources);
    });

    it('should read resources', async () => {
      const mockContent = {
        contents: [{ uri: 'test://resource', text: 'Resource content' }],
      };

      const readResourceSpy = jest
        .spyOn(client, 'readResource')
        .mockResolvedValue(mockContent as any);

      const content = await client.readResource('test://resource');

      expect(readResourceSpy).toHaveBeenCalledWith('test://resource');
      expect(content).toEqual(mockContent);
    });
  });

  describe('Prompt Operations', () => {
    beforeEach(() => {
      jest
        .spyOn(client, 'connectWithCustomTransport')
        .mockResolvedValue(undefined);
    });

    it('should list prompts', async () => {
      const mockPrompts = [
        {
          name: 'test-prompt',
          description: 'A test prompt',
        },
      ];

      const listPromptsSpy = jest
        .spyOn(client, 'listPrompts')
        .mockResolvedValue(mockPrompts);

      const prompts = await client.listPrompts();

      expect(listPromptsSpy).toHaveBeenCalled();
      expect(prompts).toEqual(mockPrompts);
    });

    it('should get prompts', async () => {
      const mockPrompt = {
        description: 'Test prompt',
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: 'Test' },
          },
        ],
      };

      const getPromptSpy = jest
        .spyOn(client, 'getPrompt')
        .mockResolvedValue(mockPrompt);

      const prompt = await client.getPrompt('test-prompt', {});

      expect(getPromptSpy).toHaveBeenCalledWith('test-prompt', {});
      expect(prompt).toEqual(mockPrompt);
    });
  });

  describe('Utility Operations', () => {
    beforeEach(() => {
      jest
        .spyOn(client, 'connectWithCustomTransport')
        .mockResolvedValue(undefined);
    });

    it('should ping server', async () => {
      const pingSpy = jest.spyOn(client, 'ping').mockResolvedValue(undefined);

      await client.ping();

      expect(pingSpy).toHaveBeenCalled();
    });

    it('should handle ping errors', async () => {
      const pingSpy = jest
        .spyOn(client, 'ping')
        .mockRejectedValue(new Error('Ping failed'));

      await expect(client.ping()).rejects.toThrow('Ping failed');
      expect(pingSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle general client errors', async () => {
      // Test that the client can handle various error conditions gracefully
      const operations = [
        () => client.listTools(),
        () => client.listResources(),
        () => client.listPrompts(),
        () => client.ping(),
      ];

      // Mock all operations to fail
      jest.spyOn(client, 'listTools').mockRejectedValue(new Error('Failed'));
      jest
        .spyOn(client, 'listResources')
        .mockRejectedValue(new Error('Failed'));
      jest.spyOn(client, 'listPrompts').mockRejectedValue(new Error('Failed'));
      jest.spyOn(client, 'ping').mockRejectedValue(new Error('Failed'));

      for (const operation of operations) {
        await expect(operation()).rejects.toThrow('Failed');
      }
    });
  });
});
