import type { OrgContext, ToolDefinition, TrustGateContext } from './types.js';

export interface ToolAdapter {
  type: 'api' | 'mcp' | 'cli';
  execute: (
    params: Record<string, unknown>,
    credentials: Record<string, string>,
    context: OrgContext
  ) => Promise<unknown>;
}

export interface InternalTool {
  definition: ToolDefinition;
  adapters: ToolAdapter[];
}

export interface PendingGate {
  tool: InternalTool;
  params: Record<string, unknown>;
  context: OrgContext;
  trustCtx: TrustGateContext;
  credentials: Record<string, string>;
}

export class ToolRegistry {
  private tools = new Map<string, InternalTool>();

  register(tool: InternalTool): void {
    const existing = this.tools.get(tool.definition.name);
    if (existing) {
      existing.adapters.push(...tool.adapters);
      return;
    }
    this.tools.set(tool.definition.name, tool);
  }

  registerMany(tools: InternalTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(toolName: string): InternalTool | undefined {
    return this.tools.get(toolName);
  }

  listForOrg(_organizationId: string): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  unregister(serverId: string): void {
    for (const [key, tool] of this.tools.entries()) {
      if (tool.definition.integration === serverId) {
        this.tools.delete(key);
      }
    }
  }
}
