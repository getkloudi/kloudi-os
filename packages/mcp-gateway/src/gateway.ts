import type {
  MCPGateway,
  MCPServerConfig,
  OrgContext,
  ToolDefinition,
  ToolCallResult,
} from './types.js';
import type { ToolRegistry, InternalTool, PendingGate } from './registry.js';

export class GatewayImpl implements MCPGateway {
  private registry: ToolRegistry;
  private pendingTrustGates = new Map<string, PendingGate>();

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async call(
    toolName: string,
    params: Record<string, unknown>,
    context: OrgContext
  ): Promise<ToolCallResult> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { status: 'error', error: `Tool not found: ${toolName}` };
    }
    return this.executeWithAdapters(tool, params, {}, context);
  }

  async callWithCredentials(
    toolName: string,
    params: Record<string, unknown>,
    credentials: Record<string, string>,
    context: OrgContext
  ): Promise<ToolCallResult> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return { status: 'error', error: `Tool not found: ${toolName}` };
    }
    return this.executeWithAdapters(tool, params, credentials, context);
  }

  private async executeWithAdapters(
    tool: InternalTool,
    params: Record<string, unknown>,
    credentials: Record<string, string>,
    context: OrgContext
  ): Promise<ToolCallResult> {
    const startMs = Date.now();
    let lastError: string | undefined;

    for (const adapter of tool.adapters) {
      try {
        const output = await adapter.execute(params, credentials, context);
        return {
          status: 'success',
          output,
          meta: {
            durationMs: Date.now() - startMs,
            integration: tool.definition.integration,
            toolName: tool.definition.name,
            authType: tool.definition.authType,
          },
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return { status: 'error', error: lastError ?? 'All adapters failed' };
  }

  async resumeAfterApproval(
    executionId: string,
    nodeId: string,
    decision: 'approve' | 'reject'
  ): Promise<ToolCallResult> {
    const key = `${executionId}:${nodeId}`;
    const pending = this.pendingTrustGates.get(key);
    if (!pending) {
      return { status: 'error', error: 'No pending trust gate found' };
    }
    this.pendingTrustGates.delete(key);

    if (decision === 'reject') {
      return { status: 'blocked', blockReason: 'Rejected by user' };
    }

    return this.executeWithAdapters(
      pending.tool,
      pending.params,
      pending.credentials,
      pending.context
    );
  }

  async listTools(organizationId: string): Promise<ToolDefinition[]> {
    return this.registry.listForOrg(organizationId);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.registry.get(name)?.definition;
  }

  async registerServer(_config: MCPServerConfig): Promise<void> {
    throw new Error('Dynamic server registration not yet implemented');
  }

  async unregisterServer(serverId: string): Promise<void> {
    this.registry.unregister(serverId);
  }

  setPendingTrustGate(key: string, gate: PendingGate): void {
    this.pendingTrustGates.set(key, gate);
  }

  getPendingTrustGate(key: string): PendingGate | undefined {
    return this.pendingTrustGates.get(key);
  }
}
