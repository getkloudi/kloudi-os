/**
 * MCP Gateway — Type Contracts
 *
 * This file is the interface contract between the AI-native execution engine
 * (consumer) and the MCP Gateway (provider). Both must agree on these types.
 *
 * Rules:
 * - The engine calls gateway.call() — it never calls external APIs directly
 * - Credentials are injected by the gateway from the Integration table
 * - The trust inspector pipeline runs inside the gateway before every execution
 * - The engine never sees raw tokens
 *
 * Auth model:
 * - Org-level: shared token for all agents in org (GitHub org token, Jira API key)
 * - User-level: personal token — actions attributed to the individual (personal GitHub token)
 */

// ---------------------------------------------------------------------------
// Context passed with every tool call
// ---------------------------------------------------------------------------

export interface OrgContext {
  /** Organization ID — used to look up Integration credentials */
  organizationId: string;

  /** User ID — used for user-level auth and trust scoring. Optional for API-key-authenticated calls. */
  userId?: string;

  /** Execution ID — for trace logging and trust gate context */
  executionId: string;

  /** Which SOP node is making this call — for trust inspector context */
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Tool definition — what the gateway exposes to the engine
// ---------------------------------------------------------------------------

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolParameter>;
}

export interface ToolDefinition {
  /** Unique name — what the LLM calls. e.g. "github_create_pr" */
  name: string;

  /** Human-readable description — shown to LLM in system prompt */
  description: string;

  /** JSON Schema for the tool's input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };

  /** Which integration this tool belongs to */
  integration: 'github' | 'jira' | 'slack' | 'builtin' | string;

  /**
   * Auth type required:
   * - org: shared org-level credentials from Integration table
   * - user: personal user-level credentials
   * - none: no credentials needed (builtin tools like read_file)
   */
  authType: 'org' | 'user' | 'none';

  /**
   * Default trust level for this tool.
   * The trust inspector can override this based on user trust scores.
   * - auto: execute without asking
   * - prompt: pause and ask the human
   * - block: never execute (security boundary)
   */
  defaultTrust: 'auto' | 'prompt' | 'block';
}

// ---------------------------------------------------------------------------
// Tool call result
// ---------------------------------------------------------------------------

export type ToolCallStatus = 'success' | 'error' | 'blocked' | 'trust_gate';

export interface ToolCallResult {
  status: ToolCallStatus;

  /** Returned data on success */
  output?: unknown;

  /** Error message on failure */
  error?: string;

  /**
   * Why execution was blocked (security inspector or trust gate).
   * Present when status === 'blocked' | 'trust_gate'
   */
  blockReason?: string;

  /** Trust gate context — present when status === 'trust_gate' */
  trustGateContext?: TrustGateContext;

  /** Metadata for tracing */
  meta?: {
    durationMs: number;
    integration: string;
    toolName: string;
    authType: 'org' | 'user' | 'none';
  };
}

// ---------------------------------------------------------------------------
// Trust gate context — passed to the UI / CLI for human approval
// ---------------------------------------------------------------------------

export interface TrustGateContext {
  toolName: string;
  description: string; // human-readable: "Create pull request in flywl/service-pim"
  params: Record<string, unknown>; // resolved parameters shown to user
  riskLevel: 'low' | 'medium' | 'high';
  isDestructive: boolean;
  requiresUserLevel: boolean; // true if org-level auth is insufficient
  executionId: string;
  nodeId: string;
}

// ---------------------------------------------------------------------------
// Inspector pipeline result
// ---------------------------------------------------------------------------

export type InspectorVerdict = 'allow' | 'prompt' | 'block';

export interface InspectorResult {
  verdict: InspectorVerdict;
  inspector: 'security' | 'egress' | 'trust' | 'repetition';
  reason?: string;
}

// ---------------------------------------------------------------------------
// Gateway server registration
// ---------------------------------------------------------------------------

export type MCPServerType = 'builtin' | 'stdio' | 'http';

export interface MCPServerConfig {
  /** Unique server ID */
  id: string;

  /** Human-readable name */
  name: string;

  type: MCPServerType;

  /**
   * For builtin: module path
   * For stdio: command + args
   * For http: base URL
   */
  config:
    | { type: 'builtin'; module: string }
    | { type: 'stdio'; command: string; args: string[] }
    | { type: 'http'; baseUrl: string; headers?: Record<string, string> };

  /** Which integration this server belongs to */
  integration: string;

  /**
   * Marketplace metadata — null until V4 marketplace ships.
   * Field exists from day 1 so no migration needed.
   */
  marketplace?: {
    id: string;
    version: string;
    publishedBy: string;
    qualityScore: number | null;
  } | null;
}

// ---------------------------------------------------------------------------
// The gateway interface — what the engine calls
// ---------------------------------------------------------------------------

export interface MCPGateway {
  /**
   * Execute a tool call.
   *
   * This is the ONLY way the engine calls external tools.
   * The gateway:
   *   1. Resolves credentials from Integration table
   *   2. Runs the trust inspector pipeline
   *   3. Routes to the correct MCP server
   *   4. Returns the result (or trust_gate if approval needed)
   */
  call(
    toolName: string,
    params: Record<string, unknown>,
    context: OrgContext
  ): Promise<ToolCallResult>;

  /**
   * List all tools available to the engine for a given org.
   * Used by the engine to build the LLM's tool definitions.
   */
  listTools(organizationId: string): Promise<ToolDefinition[]>;

  /**
   * Get a single tool definition by name.
   */
  getTool(name: string): ToolDefinition | undefined;

  /**
   * Register an MCP server with the gateway.
   * Called at startup or when a new integration is connected.
   */
  registerServer(config: MCPServerConfig): Promise<void>;

  /**
   * Remove an MCP server.
   * Called when an integration is disconnected.
   */
  unregisterServer(serverId: string): Promise<void>;

  /**
   * Resume a trust-gated tool call after human approval.
   * Called by the API when the user clicks Approve in feed or CLI.
   */
  resumeAfterApproval(
    executionId: string,
    nodeId: string,
    decision: 'approve' | 'reject'
  ): Promise<ToolCallResult>;
}

// ---------------------------------------------------------------------------
// Events emitted by the gateway — consumed by the execution engine EventStream
// ---------------------------------------------------------------------------

export type GatewayEvent =
  | {
      type: 'tool_start';
      toolName: string;
      nodeId: string;
      params: Record<string, unknown>;
    }
  | {
      type: 'tool_complete';
      toolName: string;
      nodeId: string;
      durationMs: number;
    }
  | { type: 'tool_error'; toolName: string; nodeId: string; error: string }
  | { type: 'trust_gate_fired'; context: TrustGateContext }
  | {
      type: 'trust_gate_resolved';
      nodeId: string;
      decision: 'approve' | 'reject';
    }
  | { type: 'tool_blocked'; toolName: string; nodeId: string; reason: string };

export type GatewayEventHandler = (event: GatewayEvent) => void;
