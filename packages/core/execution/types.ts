// --- Graph types (match Sop.graph JSONB structure) ---
// These re-export from @kloudi-os/shared/types for consistency,
// but also define execution-specific types.

import type { NodeType } from '@kloudi-os/shared/types';

export type {
  GraphNode,
  GraphEdge,
  Graph,
  NodeType,
  Constraint,
} from '@kloudi-os/shared/types';

// --- Node executor config types ---

export interface LLMConfig {
  prompt_template: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  output_schema?: Record<string, unknown>;
}

export interface ToolConfig {
  tool_name: string;
  parameters: Record<string, unknown>;
}

export interface SubEntityConfig {
  entity_ref: string;
  parameter_mapping: Record<string, string>;
}

export interface InterpolativeConfig {
  decision_prompt: string;
  options: string[];
  reasoning_required: boolean;
}

// --- Execution types ---

export type { SopRecord } from '../sops/sop-repository.js';

export interface ExecutionContext {
  executionId: string;
  entity: import('../sops/sop-repository.js').SopRecord;
  parameters: Record<string, unknown>;
  variables: Record<string, unknown>;
  currentNodeId: string | null;
  contextWindow: ContextWindow;
  visitedNodes: Map<string, number>;
  organizationId: string;
  credentials?: Record<string, Record<string, string>>;
}

export interface NodeExecutor {
  execute(
    node: import('@kloudi-os/shared/types').GraphNode,
    ctx: ExecutionContext,
    engine?: ExecutionEngine
  ): Promise<NodeResult>;
}

export interface NodeResult {
  status: 'completed' | 'failed' | 'waiting_input';
  output: unknown;
  error?: string;
  tokensUsed?: number | undefined;
  decisionTrace?: DecisionTrace;
  chosenOption?: string;
}

export interface DecisionTrace {
  decisionType: string;
  optionsConsidered: string[];
  chosenOption: string;
  reasoning: string;
  confidence?: number;
}

// --- Trust gate ---

export interface TrustGateContext {
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: NodeType;
  action: string; // human-readable: "Call Jira API: createIssue"
  config: Record<string, unknown>; // resolved node config
  reasoning?: string; // LLM reasoning if available
  visitCount: number; // how many times this node has run
}

// --- Callbacks ---

export interface ExecutionCallbacks {
  onNodeStart?: (executionId: string, nodeId: string, nodeName: string) => void;
  onNodeComplete?: (
    executionId: string,
    nodeId: string,
    output: unknown
  ) => void;
  onNodeFailed?: (executionId: string, nodeId: string, error: string) => void;
  onExecutionComplete?: (executionId: string, result: unknown) => void;
  onExecutionFailed?: (executionId: string, error: string) => void;
  onHumanApprovalNeeded?: (
    executionId: string,
    nodeId: string,
    question: string
  ) => Promise<string>;
  onTrustGateTriggered?: (
    context: TrustGateContext
  ) => Promise<'approve' | 'reject'>;
}

// --- Context types ---

export interface ContextWindow {
  budget: ContextBudget;
  items: ContextItem[];
  totalTokensUsed: number;
  evictedItems: EvictedItem[];
}

export interface ContextBudget {
  total: number;
  reserved: {
    system_prompt: number;
    current_sop: number;
    active_context: number;
  };
}

export interface ContextItem {
  id: string;
  type: 'system' | 'sop' | 'node_output' | 'variable' | 'history';
  content: string;
  tokens: number;
  priority: number;
  timestamp: Date;
}

export interface EvictedItem {
  item: ContextItem;
  evictedAt: Date;
  reason: string;
}

// ExecutionEngine type — to be implemented as AI-native engine (docs/current/agent-loop-design.md)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExecutionEngine = any;
