# ExecutionEngine — Phase 1 Implementation Spec

> This is the single source of truth for building the ExecutionEngine.
> Every decision is final. Do not deviate. If something seems wrong, re-read — the answer is here.

## PR Order (strict dependency chain)

```
PR 1: feat/execution-schema     → schema changes only
PR 2: feat/execution-engine     → engine + context manager (no executors)
PR 3: feat/node-executors       → 4 executor implementations
PR 4: feat/execution-routes     → wire engine into API + WebSocket
PR 5: feat/execution-tests      → tests for everything above
```

Each PR branches from main AFTER the previous PR is merged. No parallel work.

---

## PR 1: Schema Changes

**Branch:** `feat/execution-schema`
**Files modified:** `packages/core/prisma/schema.prisma` (1 file)
**Verification:** `pnpm schema:build && pnpm schema:validate && pnpm db:generate && pnpm build`

### Procedure model — ADD these fields (keep all existing fields):

```prisma
model Procedure {
  // ... keep all existing fields ...

  // ADD these:
  parentEntityId  String?
  tags            String[]  @default([])
  metadata        Json      @default("{}")
  executionCount  Int       @default(0)
  successCount    Int       @default(0)
  avgDurationMs   Int?
  avgTokensUsed   Int?

  // ADD self-relation:
  parentEntity    Procedure?  @relation("ProcedureHierarchy", fields: [parentEntityId], references: [id])
  childEntities   Procedure[] @relation("ProcedureHierarchy")

  // ADD index:
  @@index([parentEntityId])
}
```

### Execution model — REWRITE completely:

```prisma
model Execution {
  id            String    @id @default(cuid())
  procedureId   String
  status        String    @default("pending")  // pending, running, waiting_input, completed, failed
  parameters    Json      @default("{}")
  variables     Json      @default("{}")        // accumulated node outputs
  currentNodeId String?
  result        Json?
  error         String?
  tokensUsed    Int       @default(0)
  durationMs    Int?
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  workspaceId   String
  userId        String?           // who triggered this execution (for activity feed)

  procedure     Procedure       @relation(fields: [procedureId], references: [id], onDelete: Cascade)
  executionNodes ExecutionNode[]

  @@index([procedureId])
  @@index([workspaceId])
  @@index([status])
  @@map("executions")
}
```

**REMOVED fields:** `procedureSlug`, `procedureName`, `params` (renamed to `parameters`), `progress`, `steps`, `logs`
**ADDED fields:** `variables`, `currentNodeId`, `tokensUsed`, `durationMs`, `executionNodes` relation

### ExecutionNode model — NEW:

```prisma
model ExecutionNode {
  id            String    @id @default(cuid())
  executionId   String
  nodeId        String
  status        String    @default("pending")  // pending, running, completed, failed, waiting_input
  attemptNumber Int       @default(1)
  input         Json?
  output        Json?
  decisionTrace Json?
  tokensUsed    Int       @default(0)
  durationMs    Int?
  startedAt     DateTime?
  completedAt   DateTime?

  execution     Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@unique([executionId, nodeId, attemptNumber])
  @@index([executionId])
  @@map("execution_nodes")
}
```

### DO NOT:
- Change the model name from `Procedure` to `ProceduralEntity`
- Change cuid() to uuid()
- Add Prisma enums (keep String types)
- Modify the auth schema
- Add VM, Integration, Memory, or any other models — those are Phase 2+

---

## PR 2: ExecutionEngine + ContextManager

**Branch:** `feat/execution-engine`
**New files (5):**
- `packages/core/execution/execution-engine.ts`
- `packages/core/execution/context-manager.ts`
- `packages/core/execution/types.ts`
- `packages/core/execution/resolve-path.ts`
- `packages/core/execution/index.ts`

**Modified files (2):**
- `packages/core/index.ts` — add `export * from './execution/index.js'`
- `packages/core/package.json` — add `"./execution"` export

**Verification:** `pnpm build` (must pass with zero errors)

### types.ts — exact interfaces:

```typescript
// --- Graph types (match existing Procedure.graph JSONB structure) ---

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  config: Record<string, unknown>;  // type-specific config (LLMConfig, ToolConfig, etc.)
  constraints?: Constraint[];
  timeout_ms?: number;
  retry_count?: number;
}

export type NodeType =
  | 'llm_generate'
  | 'tool_call'
  | 'sub_entity'
  | 'interpolative'
  | 'condition'
  | 'parallel'
  | 'loop'
  | 'transform';

export interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Constraint {
  id: string;
  level: 'MUST' | 'SHOULD' | 'MAY';
  scope: 'entity' | 'node';
  node_id?: string;
  description: string;
  enforcement: 'block' | 'warn' | 'log';
}

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
  entity_ref: string;  // slug of child procedure
  parameter_mapping: Record<string, string>;  // child_param_name → context_path
}

export interface InterpolativeConfig {
  decision_prompt: string;
  options: string[];  // possible next node IDs
  reasoning_required: boolean;
}

// --- Execution types ---

export interface ExecutionContext {
  executionId: string;
  entity: ProcedureRecord;       // from ProcedureRepository
  parameters: Record<string, unknown>;
  variables: Record<string, unknown>;  // accumulated node outputs, keyed by node ID
  currentNodeId: string | null;
  contextWindow: ContextWindow;
  visitedNodes: Map<string, number>;   // nodeId → visit count (for cycle guard)
  workspaceId: string;
}

// DO NOT redefine ProcedureRecord here — import from existing code:
// import type { ProcedureRecord } from '../procedures/procedure-repository.js';
// Re-export it from types.ts for convenience:
export type { ProcedureRecord } from '../procedures/procedure-repository.js';

export interface NodeExecutor {
  execute(
    node: GraphNode,
    ctx: ExecutionContext,
    engine?: ExecutionEngine,  // only SubEntityExecutor uses this
  ): Promise<NodeResult>;
}

export interface NodeResult {
  status: 'completed' | 'failed' | 'waiting_input';
  output: unknown;
  tokensUsed?: number;
  decisionTrace?: DecisionTrace;
  chosenOption?: string;  // for interpolative nodes — the chosen next node ID
}

export interface DecisionTrace {
  decisionType: string;
  optionsConsidered: string[];
  chosenOption: string;
  reasoning: string;
  confidence?: number;
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
  priority: number;    // higher = harder to evict. system=100, sop=90, node_output=50
  timestamp: Date;
}

export interface EvictedItem {
  item: ContextItem;
  evictedAt: Date;
  reason: string;
}

// Forward reference to avoid circular import
export type ExecutionEngine = import('./execution-engine.js').ExecutionEngine;
```

### execution-engine.ts — exact contract:

```typescript
import type {
  ExecutionContext, NodeExecutor, NodeResult, GraphNode,
  Graph, NodeType, ProcedureRecord,
} from './types.js';
import { ContextManager } from './context-manager.js';
```

**Class: `ExecutionEngine`**

Constructor:
```typescript
constructor(
  private executors: Map<NodeType, NodeExecutor>,
  private contextManager: ContextManager,
)
```

Public methods:
```typescript
// Entry point. Creates Execution record, traverses graph, returns execution ID.
// This method is SYNCHRONOUS in setup (create record, validate, find entry node)
// then KICKS OFF async graph traversal and returns immediately.
async execute(
  procedureId: string,
  params: Record<string, unknown>,
  workspaceId: string,
  callbacks?: ExecutionCallbacks,
): Promise<{ executionId: string }>
```

```typescript
// Callbacks for real-time streaming (WebSocket wires these)
interface ExecutionCallbacks {
  onNodeStart?: (executionId: string, nodeId: string, nodeName: string) => void;
  onNodeComplete?: (executionId: string, nodeId: string, output: unknown) => void;
  onNodeFailed?: (executionId: string, nodeId: string, error: string) => void;
  onExecutionComplete?: (executionId: string, result: unknown) => void;
  onExecutionFailed?: (executionId: string, error: string) => void;
  onHumanApprovalNeeded?: (executionId: string, nodeId: string, question: string) => Promise<string>;
}
```

Private methods:
```typescript
// Main loop. Finds entry node, loops until no next node.
private async runGraph(ctx: ExecutionContext, callbacks?: ExecutionCallbacks): Promise<void>

// Uses ProceduralEntity.getEntryNodes() from procedure-entity.ts (already implements this).
// Validates exactly 1 entry node exists. Throws if 0 or >1.
private findEntryNode(graph: Graph): string

// Evaluates outgoing edges. For interpolative nodes, uses chosenOption.
// For conditional edges, evaluates condition string against ctx.variables.
private async findNextNode(
  currentNode: GraphNode,
  result: NodeResult,
  ctx: ExecutionContext,
): Promise<string | null>

// Replaces {{variable}} and {{variable.nested.path}} in node config values.
// Throws InterpolationError if variable not found.
private resolveInputs(node: GraphNode, ctx: ExecutionContext): Record<string, unknown>

// Like execute(), but awaits the graph traversal instead of using setImmediate.
// Used by SubEntityExecutor so child executions complete before the parent continues.
async executeAndWait(
  procedureId: string,
  params: Record<string, unknown>,
  workspaceId: string,
  callbacks?: ExecutionCallbacks,
): Promise<{ executionId: string; result: unknown; status: string }>
```

**Utility function (separate file `packages/core/execution/resolve-path.ts`):**
```typescript
// Walks a dotted path like "analyze.auth_type" through ctx.variables and ctx.parameters.
// Extracted as a utility so both ExecutionEngine and SubEntityExecutor can use it.
export function getNestedValue(
  ctx: { variables: Record<string, unknown>; parameters: Record<string, unknown> },
  path: string,
): unknown
```

**Cycle guard logic (inside runGraph):**
- Before executing each node, check `ctx.visitedNodes.get(nodeId)`
- If count >= 1 (node already visited once):
  - If `callbacks.onHumanApprovalNeeded` exists, call it with question: `"Node '{nodeName}' is about to run again (visit #{count+1}). Continue or abort?"`
  - If human responds "abort" or callback doesn't exist or times out → set execution status to 'failed', throw
  - If human responds "continue" → increment visit count, proceed
- If count === 0 (first visit) → set count to 1, proceed

**Database access:**
```typescript
import { Database } from '@kloudi/infrastructure/database';
const db = await Database.getInstance().getClient();
```
- `db.execution.create(...)` — at start
- `db.executionNode.create(...)` — before each node
- `db.executionNode.update(...)` — after each node
- `db.execution.update(...)` — at end (completed or failed)

**Procedure lookup (reuse existing service):**
```typescript
import { ProcedureService } from '@kloudi/core/procedures';
// Use getProcedure() or the repository's findById()
```

### context-manager.ts — exact contract:

```typescript
import type { ContextWindow, ContextBudget, ContextItem, EvictedItem, ProcedureRecord } from './types.js';
```

**Class: `ContextManager`**

```typescript
// Default budget if entity has no metadata.contextBudget
const DEFAULT_BUDGET: ContextBudget = {
  total: 128000,
  reserved: { system_prompt: 4000, current_sop: 8000, active_context: 16000 },
};
```

Methods:
```typescript
// Creates initial context window with system prompt + SOP.
initialize(entity: ProcedureRecord): ContextWindow

// Adds node output to context. Evicts if over budget.
update(window: ContextWindow, nodeId: string, output: unknown, tokensUsed: number): void

// Assembles context items into a single string for LLM calls.
// Sorted by priority (high first).
assemble(window: ContextWindow): string

// Token counting — approximate: Math.ceil(text.length / 4)
// DO NOT add a tokenizer dependency. This approximation is sufficient for Phase 1.
private countTokens(text: string): number
```

Eviction algorithm:
1. Filter items where `type !== 'system'` (never evict system prompt)
2. Sort by priority ascending, then timestamp ascending (oldest first)
3. Remove first item from list
4. Add to `window.evictedItems`
5. Recalculate `window.totalTokensUsed`
6. Repeat while `totalTokensUsed > budget.total`
7. If no evictable items remain and still over budget → log warning, truncate oldest non-system item

### index.ts — barrel exports:

```typescript
export { ExecutionEngine } from './execution-engine.js';
export { ContextManager } from './context-manager.js';
export { getNestedValue } from './resolve-path.js';
export type {
  ExecutionContext, NodeExecutor, NodeResult, DecisionTrace,
  GraphNode, GraphEdge, Graph, NodeType,
  LLMConfig, ToolConfig, SubEntityConfig, InterpolativeConfig,
  ContextWindow, ContextBudget, ContextItem,
  ProcedureRecord,
} from './types.js';
```

### Package updates:

`packages/core/package.json` — add to exports:
```json
"./execution": {
  "types": "./dist/execution/index.d.ts",
  "import": "./dist/execution/index.js"
}
```

`packages/core/index.ts` — add:
```typescript
export * from './execution/index.js';
```

### DO NOT:
- Import from `@kloudi/shared/types` for Graph/Node types — define them in `types.ts` (the shared types have a different shape)
- Use EventEmitter from Node.js — use the callbacks pattern instead
- Create a separate `errors.ts` file — throw plain `Error` with descriptive messages
- Add any executor implementations — that's PR 3
- Add a stub/mock executor — the engine should work with an empty executor map (it just won't execute any nodes)

---

## PR 3: Node Executors

**Branch:** `feat/node-executors`
**New files (5):**
- `packages/core/execution/executors/llm-executor.ts`
- `packages/core/execution/executors/tool-call-executor.ts`
- `packages/core/execution/executors/interpolative-executor.ts`
- `packages/core/execution/executors/sub-entity-executor.ts`
- `packages/core/execution/executors/index.ts`

**Modified files (2):**
- `packages/core/execution/index.ts` — re-export executors
- `packages/core/package.json` — add `"@kloudi/tools": "workspace:*"` to dependencies (ToolCallExecutor needs it)

**Verification:** `pnpm install && pnpm build`

### How executors use existing infrastructure:

**AIClient** (from `@kloudi/infrastructure/ai`):
```typescript
import { AIClient } from '@kloudi/infrastructure/ai';

// Create ONCE in the engine, pass to executors via constructor
const aiClient = new AIClient({
  context: 'execution-engine',
  provider: 'anthropic',  // or from config
  model: 'claude-sonnet-4-20250514',   // or from config
});

// LLM executors call:
const result = await aiClient.generateText(messages);
// result.text — the response
// result.usage?.totalTokens — token count

const structured = await aiClient.generateObject(messages, schema);
// structured.object — parsed object
// structured.usage?.totalTokens — token count
```

**ToolRegistry** (from `@kloudi/tools`):
```typescript
import { ToolRegistry } from '@kloudi/tools';

const registry = ToolRegistry.getInstance();
const result = await registry.execute(toolName, params, { workspaceId });
```

### llm-executor.ts:

```typescript
// Implements NodeExecutor
// config type: LLMConfig

async execute(node, ctx, _engine?): Promise<NodeResult> {
  const config = node.config as LLMConfig;
  const resolvedPrompt = /* already resolved by engine's resolveInputs */
    typeof config.prompt_template === 'string'
      ? config.prompt_template  // engine already interpolated {{vars}}
      : JSON.stringify(config);

  const messages = [
    { role: 'system' as const, content: this.contextManager.assemble(ctx.contextWindow) },
    { role: 'user' as const, content: resolvedPrompt },
  ];

  // If output_schema exists, use generateObject. Otherwise generateText.
  if (config.output_schema) {
    const result = await this.aiClient.generateObject(messages, {
      parse: (data: unknown) => data,  // pass-through, no zod
      ...config.output_schema,
    });
    return {
      status: 'completed',
      output: result.object,
      tokensUsed: result.usage?.totalTokens,
    };
  }

  const result = await this.aiClient.generateText(messages);
  return {
    status: 'completed',
    output: result.text,
    tokensUsed: result.usage?.totalTokens,
  };
}
```

**Error handling:** Wrap the AI call in try/catch:
- Timeout/network error → retry up to 2x with 1s, 3s backoff → then `{ status: 'failed', output: null }`
- Any other error → `{ status: 'failed', output: null }`, log error

### tool-call-executor.ts:

```typescript
// config type: ToolConfig

async execute(node, ctx, _engine?): Promise<NodeResult> {
  const config = node.config as ToolConfig;
  const registry = ToolRegistry.getInstance();

  if (!registry.has(config.tool_name)) {
    return { status: 'failed', output: null, error: `Tool not found: ${config.tool_name}` };
  }

  const result = await registry.execute(
    config.tool_name,
    config.parameters as Record<string, unknown>,
    { workspaceId: ctx.workspaceId },
  );

  return { status: 'completed', output: result };
}
```

### interpolative-executor.ts:

```typescript
// config type: InterpolativeConfig
// Uses AIClient.generateObject to get a structured decision

async execute(node, ctx, _engine?): Promise<NodeResult> {
  const config = node.config as InterpolativeConfig;

  const prompt = `You are making a control flow decision in a procedural execution.

Current context:
${JSON.stringify(ctx.variables, null, 2)}

Decision to make:
${config.decision_prompt}

Available options:
${config.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

${config.reasoning_required ? 'Explain your reasoning, then state your choice.' : ''}

Respond with JSON: { "reasoning": "...", "choice": "..." }
The "choice" MUST be exactly one of the option values listed above.`;

  const messages = [
    { role: 'system' as const, content: this.contextManager.assemble(ctx.contextWindow) },
    { role: 'user' as const, content: prompt },
  ];

  const result = await this.aiClient.generateText(messages);

  // Parse JSON from response
  let decision: { reasoning?: string; choice: string };
  try {
    decision = JSON.parse(result.text);
  } catch {
    // Retry once
    const retry = await this.aiClient.generateText(messages);
    decision = JSON.parse(retry.text);  // if this throws, let it propagate
  }

  // Validate choice is in options
  if (!config.options.includes(decision.choice)) {
    return { status: 'failed', output: decision };
  }

  return {
    status: 'completed',
    output: decision,
    tokensUsed: result.usage?.totalTokens,
    chosenOption: decision.choice,
    decisionTrace: {
      decisionType: 'interpolative',
      optionsConsidered: config.options,
      chosenOption: decision.choice,
      reasoning: decision.reasoning ?? '',
    },
  };
}
```

### sub-entity-executor.ts:

```typescript
// config type: SubEntityConfig
// Receives engine at call time (3rd argument)

async execute(node, ctx, engine?): Promise<NodeResult> {
  if (!engine) {
    return { status: 'failed', output: null };
  }

  const config = node.config as SubEntityConfig;

  // Look up child procedure by slug
  const childProcedure = await this.procedureService.getProcedure(
    ctx.workspaceId,
    config.entity_ref,
  );

  // Map parameters from parent context to child
  // Uses getNestedValue utility (imported from resolve-path.ts)
  const childParams: Record<string, unknown> = {};
  for (const [childKey, contextPath] of Object.entries(config.parameter_mapping)) {
    childParams[childKey] = getNestedValue(ctx, contextPath);
  }

  // Execute child synchronously using executeAndWait (no polling)
  const { result, status } = await engine.executeAndWait(
    childProcedure.id,
    childParams,
    ctx.workspaceId,
  );

  if (status === 'completed') {
    return { status: 'completed', output: result };
  }

  return { status: 'failed', output: result ?? 'Child execution failed' };
}
```

**Circular reference guard:** Before executing the child, check if `config.entity_ref === ctx.entity.slug`. If yes, return `{ status: 'failed', output: 'Circular sub-entity reference detected' }`.

### executors/index.ts:

```typescript
export { LLMExecutor } from './llm-executor.js';
export { ToolCallExecutor } from './tool-call-executor.js';
export { InterpolativeExecutor } from './interpolative-executor.js';
export { SubEntityExecutor } from './sub-entity-executor.js';
```

### DO NOT:
- Create a UserAskExecutor — the human-in-the-loop is handled by the cycle guard in the engine, not as a node type
- Use zod for LLM response validation — parse JSON manually
- Create abstract base classes for executors — each executor is standalone
- Add condition, parallel, loop, or transform executors — Phase 1.5

---

## PR 4: Wire Into API + WebSocket

**Branch:** `feat/execution-routes`
**Modified files (1):**
- `apps/api/routes/executions.routes.ts` — full rewrite

**Verification:** `pnpm build && pnpm dev:api` (start server, hit endpoints manually)

### executions.routes.ts — what changes:

1. Import `ExecutionEngine`, `ContextManager`, all executors from `@kloudi/core/execution`
2. Create engine instance at module level:

```typescript
import { ExecutionEngine, ContextManager, LLMExecutor, ToolCallExecutor, InterpolativeExecutor, SubEntityExecutor } from '@kloudi/core/execution';
import { AIClient } from '@kloudi/infrastructure/ai';
import { emitExecutionProgress, emitExecutionComplete, requestUserInput } from '../lib/websocket.js';

const contextManager = new ContextManager();
const aiClient = new AIClient({ context: 'execution-engine' });
const procedureService = new ProcedureService();

const executors = new Map([
  ['llm_generate', new LLMExecutor(aiClient, contextManager)],
  ['tool_call', new ToolCallExecutor()],
  ['interpolative', new InterpolativeExecutor(aiClient, contextManager)],
  ['sub_entity', new SubEntityExecutor(procedureService)],
]);

const engine = new ExecutionEngine(executors, contextManager);
```

3. `POST /api/procedures/:id/run` handler:

```typescript
// Look up procedure (by id or slug)
// Call engine.execute() with callbacks wired to WebSocket:
const { executionId } = await engine.execute(
  procedure.id,
  params,
  DEFAULT_WORKSPACE_ID,
  {
    onNodeStart: (execId, nodeId, name) => emitExecutionProgress(execId, { type: 'node:start', nodeId, name }),
    onNodeComplete: (execId, nodeId, output) => emitExecutionProgress(execId, { type: 'node:complete', nodeId, output }),
    onNodeFailed: (execId, nodeId, error) => emitExecutionProgress(execId, { type: 'node:failed', nodeId, error }),
    onExecutionComplete: (execId, result) => emitExecutionComplete(execId, result),
    onExecutionFailed: (execId, error) => emitExecutionProgress(execId, { type: 'execution:failed', error }),
    onHumanApprovalNeeded: async (execId, nodeId, question) => {
      // Broadcast to all subscribed clients, wait for first response
      emitExecutionProgress(execId, { type: 'human:approval_needed', nodeId, question });
      // Use requestUserInput — it returns a Promise that resolves when a client responds
      // We don't have a specific clientId here, so broadcast and accept first response
      // For Phase 1, use the first connected client
      return 'continue';  // TODO: wire to actual WebSocket response in Phase 1.5
    },
  },
);

res.status(202).json({ data: { executionId, status: 'pending' } });
```

4. `GET /api/executions/:id` — update to include ExecutionNodes:

```typescript
const execution = await db.execution.findUnique({
  where: { id },
  include: { executionNodes: { orderBy: { startedAt: 'asc' } } },
});
```

5. `GET /api/executions/:id/nodes` — NEW endpoint:

```typescript
const nodes = await db.executionNode.findMany({
  where: { executionId: id },
  orderBy: { startedAt: 'asc' },
});
```

6. `GET /api/activity` — NEW endpoint (activity feed for Home space):

```typescript
// Returns recent executions + procedure edits across the workspace
// Used by the Home activity feed — social-media-style post stream
const activity = await db.execution.findMany({
  where: { workspaceId },
  include: {
    procedure: { select: { name: true, slug: true } },
    executionNodes: { orderBy: { startedAt: 'asc' } },
  },
  orderBy: { startedAt: 'desc' },
  take: limit || 20,
  skip: offset || 0,
});
// Response shape: array of execution records with procedure name and node progress
// Frontend renders each as a feed post with avatar (from userId), status, node dots
```

### DO NOT:
- Keep the old setTimeout-based fake execution
- Import DbModel type casts — use Prisma client directly
- Add new route files — modify the existing `executions.routes.ts`

---

## PR 5: Tests

**Branch:** `feat/execution-tests`
**New files (3-4):**
- `packages/core/execution/__tests__/execution-engine.test.ts`
- `packages/core/execution/__tests__/context-manager.test.ts`
- `packages/core/execution/__tests__/executors.test.ts`

**Verification:** `pnpm test`

### Required test cases:

**execution-engine.test.ts:**
```
describe('ExecutionEngine')
  describe('findEntryNode')
    ✓ finds node with no incoming edges
    ✓ throws if no entry node
    ✓ throws if multiple entry nodes

  describe('resolveInputs')
    ✓ replaces {{variable}} with ctx.variables value
    ✓ replaces {{nested.path}} with nested value
    ✓ throws on missing variable
    ✓ handles non-string values (pass through)

  describe('runGraph')
    ✓ traverses linear graph A→B→C
    ✓ follows conditional edges
    ✓ stops at terminal node (no outgoing edges)
    ✓ records ExecutionNode for each visited node
    ✓ stores node output in ctx.variables[nodeId]

  describe('cycle guard')
    ✓ first visit proceeds without prompt
    ✓ second visit calls onHumanApprovalNeeded
    ✓ human approves → execution continues
    ✓ human aborts → execution fails

  describe('executeAndWait')
    ✓ resolves with result when graph completes
    ✓ resolves with error when graph fails

  describe('error handling')
    ✓ node executor failure → execution status=failed
    ✓ graph validation failure → immediate rejection
```

**context-manager.test.ts:**
```
describe('ContextManager')
  describe('initialize')
    ✓ creates system and sop items
    ✓ counts tokens for initial items

  describe('update')
    ✓ adds node output to items
    ✓ evicts lowest priority when over budget
    ✓ never evicts system prompt
    ✓ evicts oldest item when priorities are equal

  describe('assemble')
    ✓ returns items sorted by priority, joined by separator

  describe('countTokens')
    ✓ approximates: Math.ceil(text.length / 4)
```

**executors.test.ts:**
```
describe('LLMExecutor')
  ✓ calls AIClient.generateText and returns output
  ✓ uses generateObject when output_schema is provided
  ✓ retries on timeout, returns failed after 2 retries

describe('ToolCallExecutor')
  ✓ calls ToolRegistry.execute with resolved params
  ✓ returns failed if tool not found

describe('InterpolativeExecutor')
  ✓ returns chosen option from LLM response
  ✓ includes decision trace
  ✓ returns failed if choice not in options
  ✓ retries once on JSON parse failure

describe('SubEntityExecutor')
  ✓ detects circular reference (same slug)
  ✓ returns failed if child procedure not found
```

### Test approach:
- Mock `AIClient` and `ToolRegistry` — don't make real API calls
- Mock Prisma client — don't need a real database for unit tests
- Use the existing Jest config (`jest.config.js` in root)

### DO NOT:
- Write integration tests that require Docker/Postgres — unit tests only for PR 5
- Test WebSocket integration — that's QA (manual or `/qa` skill)

---

## Anti-Patterns — DO NOT DO THESE

1. **DO NOT create entity/repo/service triplets.** The engine is ONE class. Executors are standalone. No repository layer for ExecutionNode — use Prisma directly.

2. **DO NOT add backward compatibility.** No migration shims, no optional fields "just in case", no dual code paths. There is no production data.

3. **DO NOT use Prisma enums.** Keep `String` types for status fields. The existing codebase uses strings.

4. **DO NOT create abstract base classes** for executors. Each executor is a concrete class implementing `NodeExecutor`. No inheritance.

5. **DO NOT add a separate errors.ts** with custom error classes. Throw `new Error('descriptive message')`.

6. **DO NOT import Graph/Node types from `@kloudi/shared/types`.** Those types have a different shape (source/target vs from/to, different field names). Use the types defined in `packages/core/execution/types.ts`.

7. **DO NOT add logging to every line.** Log at: engine start, node start, node complete/fail, execution complete/fail. That's it.

8. **DO NOT add Phase 2+ features.** No VM, no EventRouter, no FilesystemProjection, no tenant models, no memory layer. If you think "we should also add X" — stop. X is deferred.

9. **DO NOT rename files or reorganize folders** outside the explicit file list for each PR.

10. **DO NOT use `import type` for values you need at runtime.** `nodenext` requires exact `.js` extensions on all relative imports.

---

## Verification Checklist (run after each PR)

```bash
eval "$(fnm env)" && fnm use 22
pnpm clean:dist                    # clear stale compiled files
pnpm build                         # must pass with zero errors
pnpm lint                          # must pass
pnpm schema:build                  # (PR 1 only) rebuild combined schema
pnpm schema:validate               # (PR 1 only) validate schema
pnpm db:generate                   # (PR 1 only) regenerate Prisma client
pnpm test                          # (PR 5) all tests pass
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | 7 proposals, 6 accepted, 1 deferred |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 4 issues, 0 critical gaps |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | ISSUES_FOUND | 11 findings, 2 accepted into scope |
| Design Review | `/plan-design-review` | UI/UX gaps | 2 | CLEAN | score: 2/10 → 8/10, 3 decisions made |

**VERDICT:** CEO + ENG + DESIGN CLEARED — ready to implement.

### Accepted Additions (from CEO + Eng + Outside Voice reviews)

**CEO Review (6 accepted):**
1. Zod input validation for execution routes (PR 4)
2. Structured execution metrics via Logger (PR 2-3)
3. Execution timeout guard, 10 min default (PR 2)
4. Cancel API — POST /executions/:id/cancel (PR 2+4)
5. Per-workspace concurrent execution limit, default 5 (PR 2+4)
6. Execution history retention/cleanup (PR 1+2)

**CEO Review — Error Handling Fixes (mandatory):**
1. LLM 429 rate limit: exponential backoff + retry
2. LLM empty response → `{ status: 'failed' }`
3. LLM refusal → `{ status: 'failed' }`
4. ToolCallExecutor: wrap `registry.execute()` in try/catch
5. SubEntityExecutor: wrap `getProcedure()` in try/catch
6. ContextManager.countTokens(null) → return 0

**CEO Review — Security Fix:**
- All execution queries must filter by workspaceId (IDOR prevention)

**CEO Review — Deployment:**
- Merge PRs 1-4 sequentially, deploy as single unit

**CEO Review — New Status:**
- Add `cancelled` to execution status enum

**Eng Review (2 findings):**
1. Add `error?: string` to `NodeResult` interface
2. Unify graph types — migrate `@kloudi/shared/types` GraphNode/GraphEdge to match engine types (from/to, config) in PR 1

**Outside Voice (2 accepted):**
1. Configurable cycle guard threshold (default: 3 instead of 1) — prevents false positives on legitimate revisits
2. Child execution concurrency counting + cancel propagation — sub-entity executions count against workspace limit, cancelling parent cancels children

**Eng Review — Test Expansion:**
- 22 additional test cases added to PR 5 requirements (total: 48 paths covered)

**Design Review (3 decisions):**
1. Empty states use system-prompt style (monospace, minimal) — matches terminal-to-OS trajectory
2. Running nodes show pulsing dot (compact) + expandable streaming output (detail) — A+B combined
3. Activity feed uses infinite scroll with virtual list — social feed pattern

**Design Review — Backend Requirements Surfaced:**
1. Add `userId` field to Execution model (PR 1) — feed needs "who ran what"
2. Add `GET /api/activity` endpoint (PR 4) — historical activity feed query (join executions + users, ordered by time)

**Design Review — Interaction States:**
All execution-related UI states (loading, empty, error, success, partial) documented for:
POST /run, GET /:id, activity feed, cancel, node progress, human approval, concurrency limit, browse, store.
See DESIGN.md for full component specs.

**Design Review — UX Specifications:**
- Node card: pulsing blue dot while running, click to expand streaming output
- Feed: infinite scroll, virtual list, 20 posts per load
- Feed post click: navigates to Editor space for that procedure
- Approval requests: inline Continue/Abort buttons on feed card (not modal)
- Empty states: system-prompt style — monospace, no illustrations, CTA as text link
- Responsive: editor full-width on mobile, agent panel collapses to overlay, stats grid 2-col
