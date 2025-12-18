/**
 * MCP SDK types re-exports for compatibility
 */

import { z } from 'zod';
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
  ServerCapabilitiesSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Re-export SDK types with MCP prefix for compatibility
export type MCPTool = z.infer<typeof ToolSchema>;
export type MCPResource = z.infer<typeof ResourceSchema>;
export type MCPPrompt = z.infer<typeof PromptSchema>;
export type MCPCallToolResult = z.infer<typeof CallToolResultSchema>;
export type MCPGetPromptResult = z.infer<typeof GetPromptResultSchema>;
export type MCPTextContent = z.infer<typeof TextContentSchema>;
export type MCPImageContent = z.infer<typeof ImageContentSchema>;
export type MCPContentBlock = z.infer<typeof ContentBlockSchema>;
export type MCPClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;
export type MCPServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

// Legacy compatibility types
export type MCPContent = MCPContentBlock;
export type MCPToolCallResponse = MCPCallToolResult;

// Protocol version and message types (keeping these for now)
export type MCPVersion = string;

export type MCPMessageType =
  | 'initialize'
  | 'initialized'
  | 'ping'
  | 'pong'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'prompts/list'
  | 'prompts/get'
  | 'completion/complete'
  | 'logging/setLevel'
  | 'notifications/cancelled'
  | 'notifications/progress'
  | 'notifications/message'
  | 'notifications/resource_updated'
  | 'notifications/resource_list_changed'
  | 'notifications/tool_list_changed'
  | 'notifications/prompt_list_changed';

// JSON-RPC types (keeping for compatibility)
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// Client interface (updated to use SDK types)
export interface MCPClient {
  connectFromTarget?(target: any): Promise<void>;
  connectWithCustomTransport?(transport: any): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args?: any): Promise<MCPCallToolResult>;
  listResources(): Promise<MCPResource[]>;
  readResource(uri: string): Promise<MCPContentBlock[]>;
  listPrompts(): Promise<MCPPrompt[]>;
  getPrompt(name: string, args?: any): Promise<MCPGetPromptResult>;
  ping(): Promise<void>;
  close(): Promise<void>;
  getServerCapabilities?(): MCPServerCapabilities | undefined;
  getServerVersion?(): any;
}

/**
 * JSON Schema type definition for tool input schemas
 * Based on JSON Schema draft-07
 */
export interface JSONSchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  // Array constraints
  items?: JSONSchemaProperty | JSONSchemaProperty[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  // Object constraints
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
  // Composition
  allOf?: JSONSchemaProperty[];
  anyOf?: JSONSchemaProperty[];
  oneOf?: JSONSchemaProperty[];
  not?: JSONSchemaProperty;
  $ref?: string;
}

export interface JSONSchema extends JSONSchemaProperty {
  $schema?: string;
  $id?: string;
  title?: string;
  definitions?: Record<string, JSONSchemaProperty>;
}
