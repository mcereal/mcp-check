/**
 * Mock MCP server for testing
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import * as http from 'http';
import WebSocket from 'ws';

export interface MockServerConfig {
  mode: 'stdio' | 'tcp' | 'websocket';
  port?: number;
  responses?: Record<string, any>;
  delays?: Record<string, number>;
  errors?: Record<string, string>;
}

/**
 * Mock MCP server that can simulate various behaviors
 */
export class MockMCPServer {
  private process?: ChildProcess;
  private tcpServer?: net.Server;
  private httpServer?: http.Server;
  private wsServer?: WebSocket.Server;
  private config: MockServerConfig;
  private messageId = 1;

  constructor(config: MockServerConfig) {
    this.config = {
      responses: {},
      delays: {},
      errors: {},
      ...config,
    };
  }

  async start(): Promise<void> {
    switch (this.config.mode) {
      case 'stdio':
        await this.startStdioServer();
        break;
      case 'tcp':
        await this.startTcpServer();
        break;
      case 'websocket':
        await this.startWebSocketServer();
        break;
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    if (this.tcpServer) {
      this.tcpServer.close();
      this.tcpServer = undefined;
    }
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = undefined;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = undefined;
    }
  }

  getConnectionConfig() {
    switch (this.config.mode) {
      case 'stdio':
        return {
          type: 'stdio' as const,
          command: 'node',
          args: ['-e', this.getStdioServerCode()],
        };
      case 'tcp':
        return {
          type: 'tcp' as const,
          host: 'localhost',
          port: this.config.port || 8080,
        };
      case 'websocket':
        return {
          type: 'websocket' as const,
          url: `ws://localhost:${this.config.port || 8080}`,
        };
    }
  }

  private async startStdioServer(): Promise<void> {
    // For stdio, we'll spawn a Node.js process that implements the protocol
    return new Promise((resolve, reject) => {
      this.process = spawn('node', ['-e', this.getStdioServerCode()], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.on('spawn', () => resolve());
      this.process.on('error', reject);
    });
  }

  private async startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpServer = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.tcpServer.listen(this.config.port || 8080, () => {
        resolve();
      });

      this.tcpServer.on('error', reject);
    });
  }

  private async startWebSocketServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer();
      this.wsServer = new WebSocket.Server({ server: this.httpServer });

      this.wsServer.on('connection', (ws) => {
        this.handleWebSocketConnection(ws);
      });

      this.httpServer.listen(this.config.port || 8080, () => {
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line.trim());
            const response = this.processMessage(message);
            if (response) {
              socket.write(JSON.stringify(response) + '\n');
            }
          } catch (error) {
            // Ignore malformed messages
          }
        }
      }
    });
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        const response = this.processMessage(message);
        if (response) {
          ws.send(JSON.stringify(response));
        }
      } catch (error) {
        // Ignore malformed messages
      }
    });
  }

  private processMessage(message: any): any {
    const { method, id } = message;

    // Check for configured errors
    if (this.config.errors?.[method]) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: this.config.errors[method],
        },
      };
    }

    // Check for configured responses
    if (this.config.responses?.[method]) {
      const delay = this.config.delays?.[method] || 0;
      const response = {
        jsonrpc: '2.0',
        id,
        result: this.config.responses[method],
      };

      if (delay > 0) {
        setTimeout(() => {
          // Response will be sent after delay
        }, delay);
        return null; // Don't send immediately
      }

      return response;
    }

    // Default responses for common methods
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: 'mock-server',
              version: '1.0.0',
            },
          },
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
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

      case 'tools/call':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Tool called with: ${JSON.stringify(message.params)}`,
              },
            ],
          },
        };

      case 'ping':
        return {
          jsonrpc: '2.0',
          id,
          result: {},
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found',
          },
        };
    }
  }

  private getStdioServerCode(): string {
    return `
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });

      const responses = ${JSON.stringify(this.config.responses || {})};
      const delays = ${JSON.stringify(this.config.delays || {})};
      const errors = ${JSON.stringify(this.config.errors || {})};

      function processMessage(message) {
        const { method, id } = message;

        if (errors[method]) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32000, message: errors[method] }
          };
        }

        if (responses[method]) {
          return {
            jsonrpc: '2.0',
            id,
            result: responses[method]
          };
        }

        switch (method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {}, resources: {} },
                serverInfo: { name: 'mock-server', version: '1.0.0' }
              }
            };
          case 'tools/list':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                tools: [{
                  name: 'test-tool',
                  description: 'A test tool',
                  inputSchema: { type: 'object', properties: { input: { type: 'string' } } }
                }]
              }
            };
          case 'tools/call':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: 'Tool called: ' + JSON.stringify(message.params) }]
              }
            };
          case 'ping':
            return { jsonrpc: '2.0', id, result: {} };
          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: 'Method not found' }
            };
        }
      }

      rl.on('line', (line) => {
        try {
          const message = JSON.parse(line);
          const response = processMessage(message);
          if (response) {
            console.log(JSON.stringify(response));
          }
        } catch (e) {
          // Ignore malformed messages
        }
      });
    `;
  }
}
