/**
 * Tool Adapters
 *
 * Adapters for connecting external tools to the ToolRegistry.
 */

export { MCPClientAdapter } from './mcp-adapter.js';
export type { MCPServerConfig } from './mcp-adapter.js';

export { registerCLITool, registerCLITools } from './cli-adapter.js';
export type { CLIToolDefinition } from './cli-adapter.js';
