#!/usr/bin/env node
/**
 * MCP Gateway — Standalone HTTP Server
 *
 * API tier: wraps GatewayImpl with the governance layer (inspectors + credential injection).
 * SDK tier (GatewayImpl alone) has no inspectors — this server adds them.
 *
 * Routes:
 *   POST /tools/call          Execute a tool call (with governance)
 *   GET  /tools               List available tools for an org
 *   POST /tools/resume        Resume after trust gate approval
 *   POST /servers/register    Register an MCP server (stub)
 *   DELETE /servers/:id       Unregister an MCP server (stub)
 *   GET  /mcp                 MCP protocol surface (stub)
 *   GET  /health              Health check
 */

import express, { type Express, type Request, type Response } from 'express';
import { GatewayImpl } from './gateway.js';
import { ToolRegistry, type PendingGate } from './registry.js';
import { registerAllTools } from './tools/index.js';
import { runInspectors } from './inspectors/index.js';
import type { TrustGateContext, OrgContext } from './types.js';

const PORT = parseInt(process.env['PORT'] ?? '3010', 10);

const app: Express = express();
app.use(express.json());

// Bootstrap
const registry = new ToolRegistry();
registerAllTools(registry);
const gateway = new GatewayImpl(registry);

// Credential injection — API tier only. Never called by SDK consumers.
async function resolveCredentials(
  integration: string,
  authType: string,
  context: OrgContext
): Promise<Record<string, string>> {
  if (authType === 'none') return {};

  const { Database } = await import('@kloudi/infrastructure/database');
  const db = await Database.getInstance().getClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = await (db as any)['integration'].findFirst({
    where: {
      organizationId: context.organizationId,
      type: integration,
      status: 'active',
    },
  });

  if (!record) {
    throw new Error(
      `No active ${integration} integration for org ${context.organizationId}`
    );
  }

  // V0: return raw credentials. P0 TODO: AES-256-GCM decrypt before returning.
  return record['credentials'] as Record<string, string>;
}

// Health check — no auth required
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mcp-gateway', version: '0.1.0' });
});

// POST /tools/call — governance wrapper
app.post('/tools/call', async (req: Request, res: Response) => {
  const { toolName, params, context } = req.body as {
    toolName: string;
    params: Record<string, unknown>;
    context: OrgContext;
  };

  const tool = registry.get(toolName);
  if (!tool) {
    res
      .status(404)
      .json({ status: 'error', error: `Tool not found: ${toolName}` });
    return;
  }

  const inspection = await runInspectors(tool, params, context);

  if (inspection.verdict === 'block') {
    res.json({ status: 'blocked', blockReason: inspection.reason });
    return;
  }

  if (inspection.verdict === 'prompt') {
    const trustCtx: TrustGateContext = {
      toolName,
      description: `${tool.definition.description} — params: ${JSON.stringify(params)}`,
      params,
      riskLevel: tool.definition.defaultTrust === 'block' ? 'high' : 'medium',
      isDestructive: tool.definition.defaultTrust === 'prompt',
      requiresUserLevel: tool.definition.authType === 'user',
      executionId: context.executionId,
      nodeId: context.nodeId,
    };

    try {
      const credentials = await resolveCredentials(
        tool.definition.integration,
        tool.definition.authType,
        context
      );
      const gate: PendingGate = {
        tool,
        params,
        context,
        trustCtx,
        credentials,
      };
      gateway.setPendingTrustGate(
        `${context.executionId}:${context.nodeId}`,
        gate
      );
    } catch {
      // Credentials unavailable — gate fires without pre-resolved creds,
      // will re-resolve on approval
      const gate: PendingGate = {
        tool,
        params,
        context,
        trustCtx,
        credentials: {},
      };
      gateway.setPendingTrustGate(
        `${context.executionId}:${context.nodeId}`,
        gate
      );
    }

    res.json({ status: 'trust_gate', trustGateContext: trustCtx });
    return;
  }

  try {
    const credentials = await resolveCredentials(
      tool.definition.integration,
      tool.definition.authType,
      context
    );
    const result = await gateway.callWithCredentials(
      toolName,
      params,
      credentials,
      context
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /tools?organizationId=xxx
app.get('/tools', async (req: Request, res: Response) => {
  const { organizationId } = req.query as { organizationId?: string };
  const tools = await gateway.listTools(organizationId ?? '');
  res.json({ tools });
});

// POST /tools/resume
app.post('/tools/resume', async (req: Request, res: Response) => {
  const { executionId, nodeId, decision } = req.body as {
    executionId: string;
    nodeId: string;
    decision: 'approve' | 'reject';
  };
  const result = await gateway.resumeAfterApproval(
    executionId,
    nodeId,
    decision
  );
  res.json(result);
});

// POST /servers/register — stub
app.post('/servers/register', async (_req: Request, res: Response) => {
  res
    .status(501)
    .json({ error: 'Dynamic server registration not yet implemented' });
});

// DELETE /servers/:id — stub
app.delete('/servers/:id', async (_req: Request, res: Response) => {
  res
    .status(501)
    .json({ error: 'Dynamic server unregistration not yet implemented' });
});

// GET /mcp — MCP protocol surface (stub — phase 2)
app.get('/mcp', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'MCP protocol surface not yet implemented' });
});

app.listen(PORT, () => {
  console.log(`mcp-gateway listening on port ${PORT}`);
});

export default app;
