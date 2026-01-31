/**
 * Built-in Tools
 *
 * Registers all built-in tools with the registry.
 */

import { ToolRegistry } from '../registry.js';
import { userTools, userEvents, respondToUserRequest, cancelUserRequest } from './user.js';
import { filesystemTools } from './filesystem.js';
import { shellTools } from './shell.js';
import { githubTools } from './github.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools:builtin');

/**
 * All built-in tools
 */
export const builtinTools = [
  ...userTools,
  ...filesystemTools,
  ...shellTools,
  ...githubTools,
];

/**
 * Register all built-in tools with a registry
 * @param {ToolRegistry} registry - Registry to register tools with
 * @returns {ToolRegistry}
 */
export function registerBuiltinTools(registry) {
  if (!registry) {
    registry = ToolRegistry.getInstance();
  }

  for (const tool of builtinTools) {
    registry.register(tool);
  }

  logger.info(`Registered ${builtinTools.length} built-in tools`);
  return registry;
}

/**
 * Create a new registry with all built-in tools
 * @returns {ToolRegistry}
 */
export function createBuiltinRegistry() {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  return registry;
}

// Re-export for convenience
export {
  userTools,
  userEvents,
  respondToUserRequest,
  cancelUserRequest,
  filesystemTools,
  shellTools,
  githubTools,
};

export default registerBuiltinTools;
