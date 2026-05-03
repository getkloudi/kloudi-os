#!/usr/bin/env node
/**
 * MCP Gateway — Standalone HTTP Server
 *
 * Runs the gateway as a separate deployable service.
 * The execution engine calls this over HTTP instead of in-process.
 *
 * Deploy:
 *   docker build -f packages/mcp-gateway/Dockerfile -t mcp-gateway .
 *   docker run -p 3010:3010 mcp-gateway
 *
 * Or run locally:
 *   node dist/server.js
 *
 * Environment variables:
 *   PORT           Gateway HTTP port (default: 3010)
 *   DATABASE_URL   Postgres connection string (to read Integration credentials)
 *   LOG_LEVEL      error | warn | info | debug (default: info)
 *
 * Routes:
 *   POST /tools/call          Execute a tool call
 *   GET  /tools               List available tools for an org
 *   POST /tools/resume        Resume after trust gate approval
 *   POST /servers/register    Register an MCP server
 *   DELETE /servers/:id       Unregister an MCP server
 *   GET  /health              Health check
 */

import express, { type Express, type Request, type Response } from 'express';

const PORT = parseInt(process.env['PORT'] ?? '3010', 10);

const app: Express = express();
app.use(express.json());

// Health check — no auth required
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mcp-gateway', version: '0.1.0' });
});

/**
 * POST /tools/call
 * Execute a tool call through the gateway.
 *
 * Body: { toolName: string, params: Record<string, unknown>, context: OrgContext }
 * Returns: ToolCallResult
 */
app.post('/tools/call', async (_req: Request, res: Response) => {
  // TODO: Implement in Agent 1 (TODOS.md — [AGENT 1] MCP Gateway)
  // 1. Validate body
  // 2. Resolve credentials from Integration table
  // 3. Run trust inspector pipeline
  // 4. Route to correct MCP server
  // 5. Return ToolCallResult
  res.status(501).json({
    error: 'Not yet implemented',
    hint: 'See TODOS.md [AGENT 1] MCP Gateway for implementation spec',
  });
});

/**
 * GET /tools?organizationId=xxx
 * List all tools available to an org.
 */
app.get('/tools', async (_req: Request, res: Response) => {
  // TODO: Return registered tools filtered by org's integrations
  res.status(501).json({ error: 'Not yet implemented' });
});

/**
 * POST /tools/resume
 * Resume a trust-gated tool call after human approval.
 *
 * Body: { executionId: string, nodeId: string, decision: 'approve' | 'reject' }
 */
app.post('/tools/resume', async (_req: Request, res: Response) => {
  // TODO: Look up pending trust gate, execute or reject
  res.status(501).json({ error: 'Not yet implemented' });
});

/**
 * POST /servers/register
 * Register an MCP server with the gateway.
 */
app.post('/servers/register', async (_req: Request, res: Response) => {
  // TODO: Validate MCPServerConfig, start server, register tools
  res.status(501).json({ error: 'Not yet implemented' });
});

/**
 * DELETE /servers/:id
 * Unregister an MCP server.
 */
app.delete('/servers/:id', async (_req: Request, res: Response) => {
  // TODO: Stop server, unregister tools
  res.status(501).json({ error: 'Not yet implemented' });
});

app.listen(PORT, () => {
  console.log(`mcp-gateway listening on port ${PORT}`);
});

export default app;
