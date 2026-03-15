/**
 * Built-in Tools
 *
 * Registers all built-in tools with the registry.
 */

import { ToolRegistry } from '../registry.js';
import {
  userTools,
  userEvents,
  respondToUserRequest,
  cancelUserRequest,
} from './user.js';
import { filesystemTools } from './filesystem.js';
import { shellTools } from './shell.js';
import { githubTools } from './github.js';
import { Logger } from '@kloudi/shared/logger';
import type { ToolDefinition } from '@kloudi/shared/types';

const logger = Logger.getInstance('tools:builtin');

/**
 * All built-in tools
 */
export const builtinTools: ToolDefinition[] = [
  ...userTools,
  ...filesystemTools,
  ...shellTools,
  ...githubTools,
];

/**
 * Register all built-in tools with a registry
 * @param registry - Registry to register tools with
 * @returns The registry with tools registered
 */
export function registerBuiltinTools(registry?: ToolRegistry): ToolRegistry {
  const targetRegistry = registry ?? ToolRegistry.getInstance();

  for (const tool of builtinTools) {
    targetRegistry.register(tool);
  }

  logger.info(`Registered ${builtinTools.length} built-in tools`);
  return targetRegistry;
}

/**
 * Create a new registry with all built-in tools
 * @returns A new ToolRegistry with built-in tools registered
 */
export function createBuiltinRegistry(): ToolRegistry {
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
