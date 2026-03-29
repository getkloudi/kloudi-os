# TODOS

Deferred work tracked from plan reviews. Each item has context so a future engineer understands why it exists.

---

## Phase 1.5: Extended Node Types
**What:** Add `parallel`, `loop`, `condition`, and `transform` node types to the ExecutionEngine.
**Why:** The spec defines 8 node types. Phase 1 ships 4 (llm_generate, tool_call, interpolative, sub_entity). These 4 complete coverage and enable more complex procedures.
**Context:** The NodeExecutor interface is extensible — adding new types is new classes implementing `execute(node, ctx, engine?)`. No engine changes needed. The cycle guard (human approval on node revisit) handles the loop case. `parallel` is the most complex — requires concurrent node execution with Promise.all and partial failure handling.
**Effort:** M | **Priority:** P2 | **Depends on:** Phase 1 engine working

## Phase 2: BullMQ Worker Process
**What:** Move graph execution from in-process `setImmediate()` to a BullMQ background worker.
**Why:** Long-running executions (10+ LLM calls) could block the API event loop. A separate worker isolates execution from API responsiveness.
**Context:** BullMQ + Redis already in dependencies. The engine is a pure function (`execute(id, params) → Execution`) easy to wrap as a job. Main work: worker entry point, route change to enqueue instead of setImmediate, serialization of execution context. Also enables retry semantics and horizontal scaling.
**Effort:** M | **Priority:** P2 | **Depends on:** Phase 1 engine working

## Phase 2: Execution Resume-From-Node
**What:** Add `resumeFrom(executionId, nodeId)` to the ExecutionEngine.
**Why:** When execution fails at node 3 of 5, user should resume from node 3 instead of re-running everything (wastes LLM tokens on completed nodes).
**Context:** Phase 1 stores all node inputs/outputs in ExecutionNode records. Resume loads prior outputs into `ctx.variables` from stored ExecutionNode records, then continues traversal from the specified node. Needs a new API endpoint: `POST /api/executions/:id/resume`.
**Effort:** M | **Priority:** P2 | **Depends on:** Phase 1 engine + ExecutionNode storage

## Dry-Run Mode for Execution Validation
**What:** Add a `dryRun: true` flag to `engine.execute()` that traverses the graph validating executor availability, variable resolution, and graph structure without making any LLM/tool calls.
**Why:** Catches procedure authoring mistakes before burning LLM tokens. `ProceduralEntity.validate()` checks graph structure but not runtime concerns (executor registration, variable availability from prior nodes).
**Context:** The engine would walk the graph, check each node type has a registered executor, and verify that `resolveInputs()` can resolve all `{{variable}}` references given the expected outputs of prior nodes. Returns a validation report instead of executing.
**Effort:** S | **Priority:** P3 | **Depends on:** Phase 1 engine working

## Orphaned Execution Cleanup
**What:** A startup check or periodic job that finds executions stuck in `running` status for >1 hour and marks them as `failed` with error `Server restarted during execution`.
**Why:** In-process execution means server restarts orphan running executions. Without cleanup, the execution list accumulates zombie `running` records that confuse the UI and waste the concurrent execution limit slots.
**Context:** The timeout guard (10 min default) prevents new executions from running forever, but doesn't fix executions orphaned before the guard was added or when the server crashes. A simple query on startup: `UPDATE executions SET status='failed', error='Orphaned' WHERE status='running' AND startedAt < NOW() - INTERVAL '1 hour'`.
**Effort:** S | **Priority:** P2 | **Depends on:** Phase 1 engine working
