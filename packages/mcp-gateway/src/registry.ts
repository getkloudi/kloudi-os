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

  async listForOrg(organizationId: string): Promise<ToolDefinition[]> {
    const { Database } = await import('@kloudi/infrastructure/database');
    const db = await Database.getInstance().getClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const integrations = await (db as any).integration.findMany({
      where: { organizationId, status: 'active' },
      select: { type: true },
    });
    const connectedTypes = new Set(integrations.map((i: { type: string }) => i.type));

    return Array.from(this.tools.values())
      .filter(
        (t) =>
          t.definition.integration === 'builtin' ||
          connectedTypes.has(t.definition.integration)
      )
      .map((t) => t.definition);
  }

  listAllTools(): ToolDefinition[] {
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
