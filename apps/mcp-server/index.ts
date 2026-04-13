#!/usr/bin/env node
/**
 * lore.dev MCP Server
 *
 * Exposes lore.dev SOPs as tools for Claude Desktop via the
 * Model Context Protocol (MCP).
 *
 * Usage:
 *   node index.js
 *
 * Configure in Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "lore": {
 *         "command": "node",
 *         "args": ["/path/to/apps/mcp-server/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const SERVER_NAME = 'lore-dev';
const SERVER_VERSION = '0.0.1';

/**
 * Create and configure the MCP server
 */
function createServer() {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all lore.dev tools
  registerTools(server);

  return server;
}

/**
 * Main entry point
 */
async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Connect server to stdio transport
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} started`);
  console.error('Waiting for Claude Desktop connection...');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
