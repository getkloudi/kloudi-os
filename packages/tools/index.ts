/**
 * @kloudi/tools
 *
 * Tool registry and built-in tool adapters for lore.dev
 *
 * This package provides:
 * - ToolRegistry: Central registry for managing and executing tools
 * - Built-in tools: user, filesystem, shell, github
 *
 * Usage:
 *   import { ToolRegistry, registerBuiltinTools } from '@kloudi/tools';
 *
 *   const registry = ToolRegistry.getInstance();
 *   registerBuiltinTools(registry);
 *
 *   // Execute a tool
 *   const result = await registry.execute('filesystem.read', {
 *     path: 'package.json'
 *   }, { workspaceRoot: '/path/to/project' });
 */

// Core registry
export { ToolRegistry } from './registry.js';

// Built-in tools
export {
  registerBuiltinTools,
  createBuiltinRegistry,
  builtinTools,
  // Individual tool exports
  userTools,
  userEvents,
  respondToUserRequest,
  cancelUserRequest,
  filesystemTools,
  shellTools,
  githubTools,
} from './builtin/index.js';

// Default export: create a registry with all built-in tools
export { default } from './builtin/index.js';
