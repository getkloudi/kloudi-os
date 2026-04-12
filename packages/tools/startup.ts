/**
 * Tool Registration Startup
 *
 * Registers all built-in and external tools with the ToolRegistry.
 */

import { Logger } from '@kloudi/shared/logger';
import type { ToolRegistry } from './registry.js';
import { registerBuiltinTools } from './builtin/index.js';
import { registerGitHubCLITools } from './builtin/github-cli.js';
import {
  registerJiraMCPTools,
  disconnectJiraMCP,
} from './builtin/jira-mcp.js';

const logger = Logger.getInstance('tools:startup');

/**
 * Register all tools (built-in + adapters) with the registry.
 *
 * - Built-in tools (filesystem, shell, github API, user) are always registered.
 * - GitHub CLI tools are always registered.
 * - Jira MCP tools are registered only if JIRA_API_TOKEN is set.
 */
export async function registerAllTools(
  registry: ToolRegistry
): Promise<void> {
  const timer = logger.time('registerAllTools');

  // Register built-in tools (Octokit-based GitHub, filesystem, shell, user)
  registerBuiltinTools(registry);

  // Register GitHub CLI tools
  registerGitHubCLITools(registry);

  // Register Jira MCP tools (if credentials available)
  if (process.env['JIRA_API_TOKEN']) {
    try {
      const jiraTools = await registerJiraMCPTools(registry);
      logger.info(`Jira MCP: ${jiraTools.length} tools registered`);
    } catch (error) {
      logger.error(
        'Jira MCP registration failed, continuing without Jira tools',
        error instanceof Error ? error : null
      );
    }
  } else {
    logger.info('JIRA_API_TOKEN not set, skipping Jira MCP tools');
  }

  const toolCount = registry.list().length;
  timer.end({ toolCount });
  logger.info(`Tool registration complete: ${toolCount} tools available`);
}

/**
 * Shutdown all external tool connections.
 */
export async function shutdownTools(
  registry?: ToolRegistry
): Promise<void> {
  logger.info('Shutting down external tool connections');
  await disconnectJiraMCP(registry);
  logger.info('Tool shutdown complete');
}
