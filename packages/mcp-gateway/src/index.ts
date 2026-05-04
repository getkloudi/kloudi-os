/**
 * MCP Gateway — Public API
 *
 * Two surfaces:
 *   SDK  — createGateway() or GatewayImpl + typed provider modules (no governance)
 *   API  — Use the standalone server (server.ts) which adds inspectors + credential injection
 *
 * Usage (execution engine, in-process):
 *   import { createGateway } from '@kloudi/mcp-gateway';
 *   const gateway = createGateway();
 *
 * Usage (typed provider, direct):
 *   import { github } from '@kloudi/mcp-gateway/github';
 *   await github.createPr({ owner, repo, title, body, base, head }, token);
 */

import { GatewayImpl } from './gateway.js';
import { ToolRegistry } from './registry.js';
import { registerAllTools } from './tools/index.js';
import type { MCPGateway } from './types.js';

/** Create a fully configured gateway with all built-in tools registered. */
export function createGateway(): MCPGateway {
  const registry = new ToolRegistry();
  registerAllTools(registry);
  return new GatewayImpl(registry);
}

/** Pre-built default gateway — zero config. */
export const gateway: MCPGateway = createGateway();

// Types
export type {
  MCPGateway,
  MCPServerConfig,
  MCPServerType,
  OrgContext,
  ToolDefinition,
  ToolParameter,
  ToolCallResult,
  ToolCallStatus,
  TrustGateContext,
  InspectorResult,
  InspectorVerdict,
  GatewayEvent,
  GatewayEventHandler,
} from './types.js';

// SDK — runtime classes (for power users who need custom tool sets)
export { GatewayImpl } from './gateway.js';
export { ToolRegistry } from './registry.js';
export type { InternalTool, ToolAdapter, PendingGate } from './registry.js';

// Typed provider modules — also accessible via subpath exports
export { github } from './providers/github/index.js';
export { jira } from './providers/jira/index.js';
export { builtin } from './providers/builtin/index.js';
