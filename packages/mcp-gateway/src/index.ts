/**
 * MCP Gateway — Public API
 *
 * Two surfaces:
 *   SDK  — GatewayImpl + ToolRegistry + typed provider modules (no governance)
 *   API  — Use the standalone server (server.ts) which adds inspectors + credential injection
 *
 * Usage (execution engine, in-process):
 *   import { GatewayImpl, ToolRegistry } from '@kloudi/mcp-gateway';
 *
 * Usage (typed provider, direct):
 *   import { github } from '@kloudi/mcp-gateway/github';
 *   await github.createPr({ owner, repo, title, body, base, head }, token);
 */

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

// SDK — runtime classes
export { GatewayImpl } from './gateway.js';
export { ToolRegistry } from './registry.js';
export type { InternalTool, ToolAdapter, PendingGate } from './registry.js';

// Typed provider modules — also accessible via subpath exports
export { github } from './providers/github/index.js';
export { jira } from './providers/jira/index.js';
export { builtin } from './providers/builtin/index.js';
