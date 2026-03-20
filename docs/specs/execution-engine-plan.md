# ExecutionEngine — Phase 1 Implementation Plan

Generated from /plan-ceo-review + /plan-eng-review + /plan-design-review sessions on 2026-03-19/20.

## Architecture Decisions (locked)

| Decision | Resolution | Why |
|---|---|---|
| Build order | Engine-first, not schema-first | The engine IS the product. CRUD for supporting tables comes later. |
| Execution model | Async + WebSocket (POST returns 202) | LLM calls take 5-30s per node. Can't block HTTP for a 5-node graph. |
| Circular dependency | Pass engine at call time to SubEntityExecutor | `execute(node, ctx, engine?)` — only SubEntityExecutor uses it. Avoids import cycle. |
| Exec runtime | In-process async via setImmediate | BullMQ worker deferred to Phase 2. Engine has comprehensive try/catch. |
| Schema cleanup | Drop steps/logs/progress from Execution, add ExecutionNode | Clean break. No production data, no backward compat needed. |
| File location | packages/core/execution/ | New domain folder. Engine is a distinct concept, not a sub-feature of procedures. |
| AIClient ownership | Engine creates one AIClient, passes to executors via context | Centralized config + usage tracking. DRY. |
| Node revisit guard | Any node visited >1 time → waiting_input + human approval via WebSocket | If a node runs twice, something unexpected happened. Human decides. |
| Node types shipped (Phase 1) | llm_generate, tool_call, interpolative, sub_entity | 4 of 8. Remaining (parallel, loop, condition, transform) deferred to Phase 1.5. |
| UI model | Terminal-first | Filesystem tree on left, command/execution terminal in center, inline human prompts. |
| Multi-execution UI | Terminal tabs with status badges | ● = running, ⚠ = needs attention, ✔ = done |

## Existing Infrastructure (reuse, don't rebuild)

| Component | Package | Status |
|---|---|---|
| Procedure model with graph/params/constraints | @kloudi/core | Done |
| Execution model | @kloudi/core | Done — needs schema changes |
| ProcedureService CRUD | @kloudi/core | Done — no changes needed |
| AIClient (generateText, generateObject) | @kloudi/infrastructure/ai | Done — returns usage |
| ToolRegistry.execute(name, params, context) | @kloudi/tools | Done |
| WebSocket emitExecutionProgress | apps/api/lib/websocket.ts | Done |
| WebSocket requestUserInput (with timeout) | apps/api/lib/websocket.ts | Done |
| EventBus (Redis pub/sub) | @kloudi/infrastructure/events | Done |

## Files to Create

```
packages/core/execution/
├── execution-engine.ts      # Graph traversal + state machine (~200 lines)
├── context-manager.ts       # Token budget + eviction (~150 lines)
├── executors/
│   ├── llm-executor.ts      # LLM node type (~100 lines)
│   ├── tool-call-executor.ts    # Tool call node type (~80 lines)
│   ├── interpolative-executor.ts # AI decision node (~120 lines)
│   └── sub-entity-executor.ts   # Child procedure execution (~80 lines)
└── index.ts                 # Barrel exports
```

## Files to Modify

```
packages/core/prisma/schema.prisma   # ExecutionNode model + Execution/Procedure enhancements
apps/api/routes/executions.routes.ts # Replace fake execution with engine
packages/core/index.ts               # Export execution module
packages/core/package.json           # Add ./execution export
```

## Execution State Machine

```
                ┌─────────┐
                │ pending │
                └────┬────┘
                     │ execute()
                     ▼
                ┌─────────┐
          ┌─────│ running │──────┐
          │     └────┬────┘      │
          │          │           │
     error│     node │      user.ask / node revisit
          │  completes│           │
          │          │           ▼
          │          │     ┌──────────────┐
          │          │     │waiting_input │
          │          │     └──────┬───────┘
          │          │            │ user responds
          │          ▼            │
          │    ┌───────────┐     │
          │    │ all nodes ├─────┘
          │    │ complete? │
          │    └─────┬─────┘
          │      yes │
          ▼          ▼
     ┌────────┐ ┌───────────┐
     │ failed │ │ completed │
     └────────┘ └───────────┘
```

## Error Handling

Every executor catches specific errors and sets ExecutionNode status to 'failed' with a message:

- LLMExecutor: timeout → retry 2x, rate limit → backoff+retry, malformed JSON → retry 1x, refusal → fail with message
- ToolCallExecutor: tool not found → fail, tool throws → fail with message
- InterpolativeExecutor: invalid choice → retry 1x, no matching edge → fail
- SubEntityExecutor: child not found → fail, circular reference → fail
- resolveInputs: missing variable → fail with variable name

## PR Breakdown

| PR | Branch | What | Size |
|----|--------|------|------|
| 1 | feat/execution-schema | Schema: ExecutionNode model, Execution/Procedure enhancements | S |
| 2 | feat/execution-engine | ExecutionEngine + ContextManager (graph traversal framework) | M |
| 3 | feat/node-executors | 4 node executors wired into engine | M |
| 4 | feat/execution-routes | Rewrite routes, wire WebSocket streaming + human-in-the-loop | M |
| 5 | feat/execution-tests | Tests for engine, executors, context manager, integration | M |

## Deferred to Phase 2+ (see TODOS.md)

- parallel, loop, condition, transform node types (Phase 1.5)
- BullMQ worker process (Phase 2)
- Execution resume-from-node (Phase 2)
- VMHarness + EventRouter (Phase 2)
- Multi-tenant org/workspace/members (Phase 3)
- Integration/Source layer (Phase 3)
- Memory facts/scratchpad (Phase 3)
- FilesystemProjection + CLI (Phase 2)

## UI Design (Terminal-First)

```
┌─────────────────────────────────────────────────────┐
│ /guides  /projects  /tasks  /skills                 │
├───────────┬─────────────────────────────────────────┤
│ /tasks/   │ [add-auth ●] [deploy ⚠] [+ new]        │
│  add-auth │─────────────────────────────────────────│
│  deploy   │ ▶ Running: Add Auth Endpoint            │
│  pr-rev   │ ✔ Analyzing requirements... done        │
│           │ ✔ Deciding approach... complex           │
│ /skills/  │ ● Generating code...                    │
│  jwt      │   [streaming LLM output here]           │
│  migrate  │                                         │
│           │─────────────────────────────────────────│
│           │ ⚠ Node revisited: retry-deploy          │
│           │ Continue or abort? [c/a] _              │
└───────────┴─────────────────────────────────────────┘
```
