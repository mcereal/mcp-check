#!/usr/bin/env ts-node
/**
 * Test MCP Server for E2E Testing
 *
 * This server implements various tools and resources for comprehensive
 * testing of mcp-check functionality including:
 * - Basic tool invocation
 * - Argument validation
 * - Timeout/slow operations
 * - Error handling
 * - Large payload handling
 * - Resource listing and fetching
 * - Cancellation support
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Create server instance
const server = new Server(
  {
    name: 'mcp-check-test-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Tool definitions
const TOOLS = [
  {
    name: 'echo',
    description: 'Echoes back the provided message',
    inputSchema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'The message to echo back',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'add',
    description: 'Adds two numbers together',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: {
          type: 'number',
          description: 'First number',
        },
        b: {
          type: 'number',
          description: 'Second number',
        },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'slow_operation',
    description: 'Simulates a slow operation that takes the specified time',
    inputSchema: {
      type: 'object' as const,
      properties: {
        delay_ms: {
          type: 'number',
          description: 'Delay in milliseconds',
          default: 1000,
        },
      },
    },
  },
  {
    name: 'error_tool',
    description: 'Throws an error with the specified message',
    inputSchema: {
      type: 'object' as const,
      properties: {
        error_message: {
          type: 'string',
          description: 'The error message to throw',
        },
        error_code: {
          type: 'number',
          description: 'Optional error code',
        },
      },
      required: ['error_message'],
    },
  },
  {
    name: 'large_payload',
    description: 'Returns a large payload of the specified size',
    inputSchema: {
      type: 'object' as const,
      properties: {
        size_kb: {
          type: 'number',
          description: 'Size of payload in kilobytes',
          default: 100,
        },
      },
    },
  },
  {
    name: 'json_data',
    description: 'Returns structured JSON data',
    inputSchema: {
      type: 'object' as const,
      properties: {
        count: {
          type: 'number',
          description: 'Number of items to return',
          default: 5,
        },
      },
    },
  },
  {
    name: 'validate_schema',
    description: 'A tool with complex input schema for validation testing',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        email: {
          type: 'string',
          format: 'email',
        },
        age: {
          type: 'integer',
          minimum: 0,
          maximum: 150,
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['name', 'email'],
    },
  },
];

// Resource definitions
const RESOURCES = [
  {
    uri: 'test://docs/readme',
    name: 'README',
    description: 'Project readme file',
    mimeType: 'text/plain',
  },
  {
    uri: 'test://docs/api',
    name: 'API Documentation',
    description: 'API documentation',
    mimeType: 'text/plain',
  },
  {
    uri: 'test://data/sample.json',
    name: 'Sample Data',
    description: 'Sample JSON data file',
    mimeType: 'application/json',
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case 'echo': {
      const message = args.message as string;
      return {
        content: [{ type: 'text', text: `Echo: ${message}` }],
      };
    }

    case 'add': {
      const a = args.a as number;
      const b = args.b as number;
      const result = a + b;
      return {
        content: [{ type: 'text', text: `Result: ${result}` }],
      };
    }

    case 'slow_operation': {
      const delayMs = (args.delay_ms as number) || 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        content: [
          { type: 'text', text: `Completed after ${delayMs}ms delay` },
        ],
      };
    }

    case 'error_tool': {
      const errorMessage = args.error_message as string;
      const errorCode = (args.error_code as number) || ErrorCode.InternalError;
      throw new McpError(errorCode, errorMessage);
    }

    case 'large_payload': {
      const sizeKb = (args.size_kb as number) || 100;
      // Generate a large string of the specified size
      const chunkSize = 1024; // 1KB
      const chunk = 'x'.repeat(chunkSize);
      const payload = chunk.repeat(sizeKb);
      return {
        content: [
          {
            type: 'text',
            text: `Large payload (${sizeKb}KB):\n${payload.substring(0, 100)}... (truncated for display, actual size: ${payload.length} bytes)`,
          },
        ],
      };
    }

    case 'json_data': {
      const count = (args.count as number) || 5;
      const items = Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        timestamp: new Date().toISOString(),
        value: Math.random() * 100,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
      };
    }

    case 'validate_schema': {
      const { name: userName, email, age, tags } = args as {
        name: string;
        email: string;
        age?: number;
        tags?: string[];
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                validated: true,
                data: { name: userName, email, age, tags },
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

// Handle list resources request
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

// Handle read resource request
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'test://docs/readme':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `# MCP Check Test Server

This is a test MCP server for E2E testing of mcp-check.

## Features
- Echo tool for basic testing
- Add tool for argument validation
- Slow operation for timeout testing
- Error tool for error handling testing
- Large payload tool for stress testing
- Resources for resource testing
`,
          },
        ],
      };

    case 'test://docs/api':
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `# API Documentation

## Tools

### echo
Echoes back the provided message.

### add
Adds two numbers together.

### slow_operation
Simulates a slow operation.

### error_tool
Throws an error for testing error handling.

### large_payload
Returns a large payload for testing large data handling.
`,
          },
        ],
      };

    case 'test://data/sample.json':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                name: 'Sample Data',
                items: [
                  { id: 1, value: 'First' },
                  { id: 2, value: 'Second' },
                  { id: 3, value: 'Third' },
                ],
                metadata: {
                  created: new Date().toISOString(),
                  version: '1.0.0',
                },
              },
              null,
              2,
            ),
          },
        ],
      };

    default:
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Test Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
