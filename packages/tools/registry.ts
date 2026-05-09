/**
 * Tool Registry
 *
 * Central registry for managing and executing tools.
 * Tools can be built-in (filesystem, shell, github) or custom.
 */

import { Logger } from '@kloudi-os/shared/logger';
import type {
  ToolDefinition,
  ToolParameters,
  ToolContext,
} from '@kloudi-os/shared/types';

const logger = Logger.getInstance('tools');

/**
 * MCP Tool format for protocol compatibility
 */
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Tool list item (without execute function)
 */
interface ToolListItem {
  name: string;
  description: string;
  parameters: ToolParameters;
}

/**
 * ToolRegistry - Manages tool registration and execution
 */
export class ToolRegistry {
  private static instance: ToolRegistry | null = null;
  private tools: Map<string, ToolDefinition>;

  constructor() {
    this.tools = new Map<string, ToolDefinition>();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool
   * @param tool - Tool definition
   * @returns Returns this for chaining
   */
  register(tool: ToolDefinition): ToolRegistry {
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
   * @param name - Tool name
   * @returns Tool definition or undefined
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   * @param name - Tool name
   * @returns True if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   * @returns Array of tool list items
   */
  list(): ToolListItem[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Execute a tool by name
   * @param name - Tool name
   * @param params - Tool parameters
   * @param context - Execution context (workspace, auth tokens, etc.)
   * @returns Tool result
   */
  async execute(
    name: string,
    params: Record<string, unknown> = {},
    context: ToolContext = {}
  ): Promise<unknown> {
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      timer.end({ success: false, error: errorMessage });
      logger.error(`Tool "${name}" failed`, error as Error);
      throw error;
    }
  }

  /**
   * Unregister a tool
   * @param name - Tool name
   * @returns True if tool was removed
   */
  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      logger.debug(`Unregistered tool: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    logger.debug('Cleared all tools');
  }

  /**
   * Get tools formatted for MCP protocol
   * @returns Array of MCP tool definitions
   */
  toMCPTools(): MCPTool[] {
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
