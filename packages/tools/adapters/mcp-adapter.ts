/**
 * MCP Client Adapter
 *
 * Spawns an MCP server as a child process and registers its tools
 * in the ToolRegistry. Uses @modelcontextprotocol/sdk for transport.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Logger } from '@kloudi-os/shared/logger';
import type { ToolRegistry } from '../registry.js';
import type { ToolContext } from '@kloudi-os/shared/types';

const logger = Logger.getInstance('tools:mcp-adapter');

/**
 * Configuration for spawning an MCP server process
 */
export interface MCPServerConfig {
  /** Command to run (e.g. 'npx') */
  command: string;
  /** Command arguments (e.g. ['-y', '@anthropic/jira-mcp-server']) */
  args: string[];
  /** Environment variables to pass to the child process */
  env?: Record<string, string>;
  /** Display name for logging */
  name?: string;
  /** Timeout in ms for tool calls (default: 30000) */
  timeout?: number;
}

/**
 * MCP Client Adapter
 *
 * Connects to an MCP server via stdio transport, discovers its tools,
 * and registers them in a ToolRegistry.
 */
export class MCPClientAdapter {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: MCPServerConfig;
  private connected = false;
  private registeredToolNames: string[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /**
   * Connect to the MCP server, discover tools, and register them
   * in the provided ToolRegistry.
   */
  async connect(registry: ToolRegistry): Promise<string[]> {
    const serverName = this.config.name ?? this.config.command;

    try {
      logger.info(`Connecting to MCP server: ${serverName}`);

      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: {
          ...process.env,
          ...(this.config.env ?? {}),
        } as Record<string, string>,
      });

      this.client = new Client({
        name: 'kloudi-tools',
        version: '0.1.0',
      });

      await this.client.connect(this.transport);
      this.connected = true;

      logger.info(`Connected to MCP server: ${serverName}`);

      // Discover and register tools
      const toolNames = await this.discoverAndRegister(registry);
      this.registeredToolNames = toolNames;

      return toolNames;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to connect to MCP server: ${serverName}`,
        error instanceof Error ? error : null,
        { serverName }
      );
      throw new Error(
        `MCP server connection failed (${serverName}): ${message}`
      );
    }
  }

  /**
   * Discover tools from the MCP server and register them in the registry.
   */
  private async discoverAndRegister(registry: ToolRegistry): Promise<string[]> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    const result = await this.client.listTools();
    const tools = result.tools;
    const registeredNames: string[] = [];

    for (const tool of tools) {
      const toolName = tool.name;
      const inputSchema = tool.inputSchema as {
        type?: string;
        properties?: Record<string, { type: string; description?: string }>;
        required?: string[];
      };

      // Build ToolParameters from MCP input schema
      const properties: Record<string, { type: string; description?: string }> =
        {};
      if (inputSchema.properties) {
        for (const [key, value] of Object.entries(inputSchema.properties)) {
          const prop = value as {
            type?: string;
            description?: string;
          };
          properties[key] = {
            type: (prop.type as string) ?? 'string',
            ...(prop.description != null
              ? { description: prop.description }
              : {}),
          };
        }
      }

      const client = this.client;
      const timeout = this.config.timeout ?? 30_000;

      registry.register({
        name: toolName,
        description: tool.description ?? '',
        parameters: {
          type: 'object',
          properties,
          required: (inputSchema.required as string[]) ?? [],
        },
        execute: async (
          params: Record<string, unknown>,
          _context: ToolContext
        ): Promise<unknown> => {
          return this.callTool(client, toolName, params, timeout);
        },
      });

      registeredNames.push(toolName);
      logger.debug(`Registered MCP tool: ${toolName}`);
    }

    logger.info(`Discovered ${registeredNames.length} tools from MCP server`);
    return registeredNames;
  }

  /**
   * Call a tool on the MCP server with timeout handling.
   */
  private async callTool(
    client: Client,
    toolName: string,
    params: Record<string, unknown>,
    timeout: number
  ): Promise<unknown> {
    const timer = logger.time(`mcp:${toolName}`);

    try {
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: params }),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => {
            reject(
              new Error(`MCP tool "${toolName}" timed out after ${timeout}ms`)
            );
          }, timeout);
        }),
      ]);

      timer.end({ success: true });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      timer.end({ success: false, error: message });
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server and unregister all tools.
   */
  async disconnect(registry?: ToolRegistry): Promise<void> {
    const serverName = this.config.name ?? this.config.command;

    if (registry) {
      for (const name of this.registeredToolNames) {
        registry.unregister(name);
      }
      logger.debug(`Unregistered ${this.registeredToolNames.length} MCP tools`);
    }

    this.registeredToolNames = [];

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        logger.warn(`Error closing MCP client for ${serverName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.client = null;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        logger.warn(`Error closing MCP transport for ${serverName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.transport = null;
    }

    this.connected = false;
    logger.info(`Disconnected from MCP server: ${serverName}`);
  }

  /**
   * Whether the adapter is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Names of tools registered by this adapter.
   */
  getRegisteredTools(): string[] {
    return [...this.registeredToolNames];
  }
}
