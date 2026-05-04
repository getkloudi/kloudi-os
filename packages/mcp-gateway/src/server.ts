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
 *   POST /admin/api-keys      Provision API keys (admin-only)
 */

import express, { type Express, type Request, type Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { GatewayImpl } from './gateway.js';
import { ToolRegistry, type PendingGate } from './registry.js';
import { registerAllTools } from './tools/index.js';
import { runInspectors } from './inspectors/index.js';
import { decryptCredentials } from '@kloudi/core/organization/integration-service';
import { recordUsage } from '@kloudi/platform/billing';
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

  const raw = record['credentials'];
  // safeDecrypt: handles both AES-256-GCM encrypted strings and legacy plaintext objects
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed['iv'] === 'string' && typeof parsed['data'] === 'string' && typeof parsed['tag'] === 'string') {
        return decryptCredentials(raw);
      }
    } catch {
      // not JSON — fall through
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, string>;
  }
  return decryptCredentials(typeof raw === 'string' ? raw : JSON.stringify(raw));
}

// API key authentication middleware
async function requireApiKey(
  req: Request,
  res: Response,
  next: () => void
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const rawKey = authHeader.slice(7);
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const { Database } = await import('@kloudi/infrastructure/database');
  const db = await Database.getInstance().getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiKey = await (db as any).apiKey.findUnique({ where: { keyHash } });
  if (!apiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Set org on request, update lastUsedAt async (don't block the request)
  (req as any).organizationId = apiKey.organizationId; // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  next();
}

// Health check — no auth required
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mcp-gateway', version: '0.1.0' });
});

// POST /admin/api-keys — provision API keys (admin-only)
app.post('/admin/api-keys', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env['GATEWAY_ADMIN_KEY'] ?? '';
  const providedKey = typeof adminKey === 'string' ? adminKey : '';
  const keysMatch =
    providedKey.length === expectedKey.length &&
    timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey));
  if (!keysMatch) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { organizationId, name } = req.body as {
    organizationId: string;
    name: string;
  };
  const rawKey = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const { Database } = await import('@kloudi/infrastructure/database');
  const db = await Database.getInstance().getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).apiKey.create({ data: { organizationId, keyHash, name } });
  res.json({ key: rawKey }); // Only returned once — store it
});

// POST /tools/call — governance wrapper
app.post('/tools/call', requireApiKey, async (req: Request, res: Response) => {
  const { toolName, params } = req.body as {
    toolName: string;
    params: Record<string, unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organizationId = (req as any).organizationId as string;
  // build context from authenticated org
  const reqId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const context: OrgContext = { organizationId, executionId: organizationId, nodeId: reqId };

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
    // Record usage async — don't block the response
    recordUsage(organizationId, 'mcp-gateway', 'tool_call', 1, {
      toolName,
    }).catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /tools?organizationId=xxx
app.get('/tools', requireApiKey, async (req: Request, res: Response) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organizationId = (req as any).organizationId as string;
  const tools = await gateway.listTools(organizationId);
  res.json({ tools });
});

// POST /tools/resume
app.post(
  '/tools/resume',
  requireApiKey,
  async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (req as any).organizationId as string;
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

    // Record usage on successful approval + execution
    if (result.status === 'success') {
      recordUsage(organizationId, 'mcp-gateway', 'tool_call', 1, {
        toolName: result.meta?.toolName,
        resumedFromTrustGate: true,
      }).catch(() => {});
    }

    res.json(result);
  }
);

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
