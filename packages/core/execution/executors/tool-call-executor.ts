import type { GraphNode } from '@kloudi/shared/types';
import type { ExecutionContext, NodeResult, NodeExecutor, ExecutionEngine, ToolConfig } from '../types.js';
import { Logger } from '@kloudi/shared/logger';

const logger = Logger.getInstance('tool-call-executor');

interface ToolRegistryInstance {
  has(name: string): boolean;
  execute(name: string, params: Record<string, unknown>, context: Record<string, unknown>): Promise<unknown>;
}

export class ToolCallExecutor implements NodeExecutor {
  constructor(private getRegistry: () => ToolRegistryInstance) {}

  async execute(
    node: GraphNode,
    ctx: ExecutionContext,
    _engine?: ExecutionEngine,
  ): Promise<NodeResult> {
    const config = node.config as unknown as ToolConfig;
    const registry = this.getRegistry();

    if (!registry.has(config.tool_name)) {
      return {
        status: 'failed',
        output: null,
        error: `Tool not found: ${config.tool_name}`,
      };
    }

    try {
      const result = await registry.execute(
        config.tool_name,
        config.parameters as Record<string, unknown>,
        { workspaceId: ctx.workspaceId },
      );

      return { status: 'completed', output: result };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Tool execution failed', err instanceof Error ? err : new Error(errorMsg), {
        nodeId: node.id,
        tool: config.tool_name,
      });
      return { status: 'failed', output: null, error: errorMsg };
    }
  }
}
