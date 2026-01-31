/**
 * Tool Registry
 *
 * Central registry for managing and executing tools.
 * Tools can be built-in (filesystem, shell, github) or custom.
 */

import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tools');

/**
 * Tool definition structure
 * @typedef {Object} ToolDefinition
 * @property {string} name - Unique tool name (e.g., 'filesystem.read')
 * @property {string} description - Human-readable description
 * @property {Object} parameters - JSON Schema for parameters
 * @property {Function} execute - Async function (params, context) => result
 */

/**
 * ToolRegistry - Manages tool registration and execution
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool
   * @param {ToolDefinition} tool - Tool definition
   * @returns {ToolRegistry} - Returns this for chaining
   */
  register(tool) {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }

    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool "${tool.name}" must have an execute function`);
    }

    if (this.tools.has(tool.name)) {
      logger.warn(`Tool "${tool.name}" is being overwritten`);
    }

    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || {},
      execute: tool.execute,
    });

    logger.debug(`Registered tool: ${tool.name}`);
    return this;
  }

  /**
   * Get a tool by name
   * @param {string} name - Tool name
   * @returns {ToolDefinition|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   * @param {string} name - Tool name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   * @returns {Array<{name: string, description: string, parameters: Object}>}
   */
  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Execute a tool by name
   * @param {string} name - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context (workspace, auth tokens, etc.)
   * @returns {Promise<any>} - Tool result
   */
  async execute(name, params = {}, context = {}) {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    const timer = logger.time(`tool:${name}`);

    try {
      logger.debug(`Executing tool: ${name}`, { params: Object.keys(params) });

      const result = await tool.execute(params, context);

      timer.end({ success: true });
      return result;
    } catch (error) {
      timer.end({ success: false, error: error.message });
      logger.error(`Tool "${name}" failed`, error);
      throw error;
    }
  }

  /**
   * Unregister a tool
   * @param {string} name - Tool name
   * @returns {boolean} - True if tool was removed
   */
  unregister(name) {
    const removed = this.tools.delete(name);
    if (removed) {
      logger.debug(`Unregistered tool: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all tools
   */
  clear() {
    this.tools.clear();
    logger.debug('Cleared all tools');
  }

  /**
   * Get tools formatted for MCP protocol
   * @returns {Array<Object>}
   */
  toMCPTools() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: tool.parameters.properties || {},
        required: tool.parameters.required || [],
      },
    }));
  }
}

export default ToolRegistry;
