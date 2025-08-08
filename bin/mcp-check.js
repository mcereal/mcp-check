#!/usr/bin/env node

/**
 * mcp-check CLI entry point
 */

const { runCLI } = require('../dist/cli/index.js');

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the CLI
runCLI().catch((error) => {
  console.error('CLI Error:', error);
  process.exit(1);
});
