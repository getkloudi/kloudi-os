/**
 * MCP Gateway — Public API
 *
 * The single interface between the AI-native execution engine and all tools.
 * See src/types.ts for the full contract.
 *
 * Usage (by execution engine):
 *   import { type MCPGateway, type OrgContext, type ToolDefinition } from '@kloudi/mcp-gateway';
 *
 * Implementation TODO (Agent 1 from TODOS.md):
 *   - Create GatewayImpl that implements MCPGateway
 *   - Register builtin tools (read_file, write_file, bash)
 *   - Register GitHub MCP server
 *   - Register Jira MCP server
 *   - Wire trust inspector pipeline
 */

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
