/**
 * mcp-check - A comprehensive testing framework for Model Context Protocol (MCP) servers and clients
 *
 * This is the main entry point for the mcp-check library. It provides:
 * - Core testing framework
 * - Configuration management
 * - Transport abstractions
 * - Chaos engineering capabilities
 * - Comprehensive reporting
 */

// Core exports
export * from './types';
export * from './core';
export * from './suites';
export * from './transports';
export * from './chaos';
export * from './reporting';
export * from './cli';

// Main checker class
export { MCPChecker } from './core/checker';

// Configuration utilities
export { loadConfig, validateConfig } from './core/config';

// CLI entry point
export { runCLI } from './cli/index';
