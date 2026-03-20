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
