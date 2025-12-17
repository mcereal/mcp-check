/**
 * Real E2E tests against the test MCP server
 *
 * These tests run against an actual MCP server implementation
 * to validate mcp-check's end-to-end functionality.
 */

import * as path from 'path';
import { StdioTransport } from '../../src/transports/stdio';

describe('Real MCP Server E2E Tests', () => {
  const serverPath = path.join(
    __dirname,
    '../../examples/servers/test-server/dist/server.js',
  );

  describe('StdioTransport with Real Server', () => {
    let transport: StdioTransport;

    afterEach(async () => {
      if (transport) {
        try {
          await transport.close();
        } catch (error) {
          // Ignore close errors in cleanup
        }
      }
    });

    it('should connect to the test server', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      expect(transport.state).toBe('connected');
    });

    it('should complete MCP handshake with initialize', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Send initialize request
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'mcp-check-e2e-test',
            version: '1.0.0',
          },
        },
      };

      await transport.send(initRequest);

      // Wait for response
      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 1,
        5000,
      );

      expect(response).toBeDefined();
      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBeDefined();
      expect(response.result.serverInfo).toBeDefined();
      expect(response.result.serverInfo.name).toBe('mcp-check-test-server');
    });

    it('should list tools from server', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize first
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      // Send initialized notification
      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // List tools
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        5000,
      );

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);

      const toolNames = response.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('slow_operation');
      expect(toolNames).toContain('error_tool');
      expect(toolNames).toContain('large_payload');
    });

    it('should invoke echo tool successfully', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Call echo tool
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: { message: 'Hello, E2E Test!' },
        },
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        5000,
      );

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0].text).toContain('Hello, E2E Test!');
    });

    it('should invoke add tool with numeric arguments', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Call add tool
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'add',
          arguments: { a: 42, b: 58 },
        },
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        5000,
      );

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0].text).toContain('100');
    });

    it('should list resources from server', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // List resources
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {},
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        5000,
      );

      expect(response.result).toBeDefined();
      expect(response.result.resources).toBeDefined();
      expect(Array.isArray(response.result.resources)).toBe(true);

      const resourceUris = response.result.resources.map((r: any) => r.uri);
      expect(resourceUris).toContain('test://docs/readme');
      expect(resourceUris).toContain('test://docs/api');
    });

    it('should read resource content', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Read resource
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/read',
        params: {
          uri: 'test://docs/readme',
        },
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        5000,
      );

      expect(response.result).toBeDefined();
      expect(response.result.contents).toBeDefined();
      expect(response.result.contents[0].text).toContain('MCP Check Test Server');
    });

    it('should handle error responses from error_tool', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Call error tool
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'error_tool',
          arguments: { error_message: 'Test error message' },
        },
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        5000,
      );

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Test error message');
    });

    it('should handle slow operations within timeout', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Call slow operation (500ms delay)
      const startTime = Date.now();
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'slow_operation',
          arguments: { delay_ms: 500 },
        },
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        10000,
      );
      const elapsed = Date.now() - startTime;

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('500ms delay');
      expect(elapsed).toBeGreaterThanOrEqual(400); // Allow some timing variance
    });

    it('should handle large payloads', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Request large payload (50KB)
      await transport.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'large_payload',
          arguments: { size_kb: 50 },
        },
      });

      const response = await transport.waitForMessage(
        (msg: any) => msg.id === 2,
        10000,
      );

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0].text).toContain('50KB');
    });
  });

  describe('Connection Lifecycle', () => {
    let transport: StdioTransport;

    afterEach(async () => {
      if (transport) {
        try {
          await transport.close();
        } catch (error) {
          // Ignore
        }
      }
    });

    it('should gracefully close connection', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      expect(transport.state).toBe('connected');

      await transport.close();

      expect(transport.state).toBe('disconnected');
    });

    it('should track message statistics', async () => {
      transport = new StdioTransport();

      await transport.connect({
        type: 'stdio',
        command: 'node',
        args: [serverPath],
      });

      // Send initialize
      await transport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      });
      await transport.waitForMessage((msg: any) => msg.id === 1, 5000);

      const stats = transport.stats;
      expect(stats.messagesSent).toBeGreaterThan(0);
      expect(stats.messagesReceived).toBeGreaterThan(0);
    });
  });
});
