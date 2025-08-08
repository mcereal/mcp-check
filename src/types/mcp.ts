/**
 * Model Context Protocol (MCP) specific types and interfaces
 */

/**
 * MCP protocol version
 */
export type MCPVersion = string;

/**
 * MCP message types
 */
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

/**
 * MCP request message
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

/**
 * MCP response message
 */
export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: MCPError;
}

/**
 * MCP notification message
 */
export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

/**
 * MCP error
 */
export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

/**
 * MCP initialization request
 */
export interface MCPInitializeRequest extends MCPRequest {
  method: 'initialize';
  params: {
    protocolVersion: MCPVersion;
    capabilities: MCPClientCapabilities;
    clientInfo: {
      name: string;
      version: string;
    };
  };
}

/**
 * MCP initialization response
 */
export interface MCPInitializeResponse extends MCPResponse {
  result: {
    protocolVersion: MCPVersion;
    capabilities: MCPServerCapabilities;
    serverInfo: {
      name: string;
      version: string;
    };
  };
}

/**
 * MCP client capabilities
 */
export interface MCPClientCapabilities {
  experimental?: Record<string, any>;
  sampling?: {};
  roots?: {
    listChanged?: boolean;
  };
}

/**
 * MCP server capabilities
 */
export interface MCPServerCapabilities {
  experimental?: Record<string, any>;
  logging?: {};
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
}

/**
 * MCP tool definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any; // JSON Schema
}

/**
 * MCP tool call request
 */
export interface MCPToolCallRequest extends MCPRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: any;
  };
}

/**
 * MCP tool call response
 */
export interface MCPToolCallResponse extends MCPResponse {
  result: {
    content: MCPContent[];
    isError?: boolean;
  };
}

/**
 * MCP content types
 */
export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent;

/**
 * MCP text content
 */
export interface MCPTextContent {
  type: 'text';
  text: string;
}

/**
 * MCP image content
 */
export interface MCPImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
}

/**
 * MCP resource content
 */
export interface MCPResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string; // base64
  };
}

/**
 * MCP resource definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP prompt definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

/**
 * MCP prompt argument
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * MCP client interface for testing
 */
export interface MCPClient {
  /**
   * Initialize connection and handshake
   */
  initialize(
    capabilities?: MCPClientCapabilities,
  ): Promise<MCPInitializeResponse>;

  /**
   * List available tools
   */
  listTools(): Promise<MCPTool[]>;

  /**
   * Call a tool
   */
  callTool(name: string, args?: any): Promise<MCPToolCallResponse>;

  /**
   * List available resources
   */
  listResources(): Promise<MCPResource[]>;

  /**
   * Read a resource
   */
  readResource(uri: string): Promise<MCPContent[]>;

  /**
   * List available prompts
   */
  listPrompts(): Promise<MCPPrompt[]>;

  /**
   * Get a prompt
   */
  getPrompt(name: string, args?: any): Promise<MCPContent[]>;

  /**
   * Send a ping
   */
  ping(): Promise<void>;

  /**
   * Close the connection
   */
  close(): Promise<void>;

  /**
   * Subscribe to notifications
   */
  onNotification(handler: (notification: MCPNotification) => void): void;
}
