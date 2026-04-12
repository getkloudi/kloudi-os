/**
 * Jira MCP Server Configuration
 *
 * Configuration for connecting to the Jira MCP server.
 * Credentials are read from environment variables.
 */

import type { MCPServerConfig } from '../adapters/mcp-adapter.js';
import { MCPClientAdapter } from '../adapters/mcp-adapter.js';
import type { ToolRegistry } from '../registry.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools:jira-mcp');

/**
 * MCP server config for Jira
 */
export const jiraMcpConfig: MCPServerConfig = {
  command: 'npx',
  args: ['-y', '@anthropic/jira-mcp-server'],
  env: {
    JIRA_API_TOKEN: process.env['JIRA_API_TOKEN'] ?? '',
    JIRA_BASE_URL: process.env['JIRA_BASE_URL'] ?? '',
    JIRA_USER_EMAIL: process.env['JIRA_USER_EMAIL'] ?? '',
  },
  name: 'jira',
  timeout: 30_000,
};

/** Singleton adapter instance for Jira */
let jiraAdapter: MCPClientAdapter | null = null;

/**
 * Register Jira MCP tools in the registry.
 *
 * Spawns the Jira MCP server, discovers its tools, and registers them.
 * Returns the list of registered tool names.
 */
export async function registerJiraMCPTools(
  registry: ToolRegistry
): Promise<string[]> {
  if (!process.env['JIRA_API_TOKEN']) {
    logger.warn(
      'JIRA_API_TOKEN not set, skipping Jira MCP tool registration'
    );
    return [];
  }

  try {
    jiraAdapter = new MCPClientAdapter(jiraMcpConfig);
    const toolNames = await jiraAdapter.connect(registry);
    logger.info(`Registered ${toolNames.length} Jira MCP tools`);
    return toolNames;
  } catch (error) {
    logger.error(
      'Failed to register Jira MCP tools',
      error instanceof Error ? error : null
    );
    jiraAdapter = null;
    return [];
  }
}

/**
 * Disconnect the Jira MCP server and unregister its tools.
 */
export async function disconnectJiraMCP(
  registry?: ToolRegistry
): Promise<void> {
  if (jiraAdapter) {
    await jiraAdapter.disconnect(registry);
    jiraAdapter = null;
  }
}
