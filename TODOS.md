# TODOS

Deferred work tracked from plan reviews. Each item has context so a future engineer understands why it exists.

---

## Sprint 1.5: Extended Node Types

**What:** Add `parallel`, `loop`, `condition`, and `transform` node types to the ExecutionEngine.
**Why:** The spec defines 8 node types. Sprint 1 ships 4 (llm_generate, tool_call, interpolative, sub_entity). These 4 complete coverage and enable more complex procedures.
**Context:** The NodeExecutor interface is extensible — adding new types is new classes implementing `execute(node, ctx, engine?)`. No engine changes needed. The cycle guard (human approval on node revisit) handles the loop case. `parallel` is the most complex — requires concurrent node execution with Promise.all and partial failure handling.
**Effort:** M | **Priority:** P2 | **Depends on:** Sprint 1 engine working

## Background Worker Process (queue technology TBD)

**What:** Move graph execution from in-process `setImmediate()` to a background worker.
**Why:** Long-running executions (10+ LLM calls) could block the API event loop. A separate worker isolates execution from API responsiveness.
**Context:** Queue technology TBD (evaluate Temporal, pg-boss, or Postgres polling based on Sprint 1 execution patterns). The engine is a pure function (`execute(id, params) → Execution`) easy to wrap as a job. Main work: worker entry point, route change to enqueue instead of setImmediate, serialization of execution context. Also enables retry semantics and horizontal scaling.
**Effort:** M | **Priority:** P2 | **Depends on:** Sprint 1 engine working

## Sprint 2: Execution Resume-From-Node

**What:** Add `resumeFrom(executionId, nodeId)` to the ExecutionEngine.
**Why:** When execution fails at node 3 of 5, user should resume from node 3 instead of re-running everything (wastes LLM tokens on completed nodes).
**Context:** Sprint 1 stores all node inputs/outputs in ExecutionNode records. Resume loads prior outputs into `ctx.variables` from stored ExecutionNode records, then continues traversal from the specified node. Needs a new API endpoint: `POST /api/executions/:id/resume`.
**Effort:** M | **Priority:** P2 | **Depends on:** Sprint 1 engine + ExecutionNode storage

## Dry-Run Mode for Execution Validation

**What:** Add a `dryRun: true` flag to `engine.execute()` that traverses the graph validating executor availability, variable resolution, and graph structure without making any LLM/tool calls.
**Why:** Catches procedure authoring mistakes before burning LLM tokens. `ProceduralEntity.validate()` checks graph structure but not runtime concerns (executor registration, variable availability from prior nodes).
**Context:** The engine would walk the graph, check each node type has a registered executor, and verify that `resolveInputs()` can resolve all `{{variable}}` references given the expected outputs of prior nodes. Returns a validation report instead of executing.
**Effort:** S | **Priority:** P3 | **Depends on:** Sprint 1 engine working

## Orphaned Execution Cleanup

**What:** A startup check or periodic job that finds executions stuck in `running` status for >1 hour and marks them as `failed` with error `Server restarted during execution`.
**Why:** In-process execution means server restarts orphan running executions. Without cleanup, the execution list accumulates zombie `running` records that confuse the UI and waste the concurrent execution limit slots.
**Context:** The timeout guard (10 min default) prevents new executions from running forever, but doesn't fix executions orphaned before the guard was added or when the server crashes. A simple query on startup: `UPDATE executions SET status='failed', error='Orphaned' WHERE status='running' AND startedAt < NOW() - INTERVAL '1 hour'`.
**Effort:** S | **Priority:** P2 | **Depends on:** Sprint 1 engine working

## Import Remaining 41 Gstack Skills as SOPs

**What:** Convert remaining 41 gstack skills to procedure graph JSON and import into Postgres.
**Why:** Sprint 1 proves execution with 3 skills. The full skill library (44 total) makes kloudi.os useful for real work.
**Context:** CC hand-designs each graph by reading the SKILL.md and modeling the workflow as nodes/edges. At ~30 min per skill with CC, this is 2-3 sessions of focused work. Not building a parser — doing things that don't scale.
**Effort:** L | **Priority:** P2 | **Depends on:** Sprint 1 trust gate + execution working

## Per-Integration Credential Storage

**What:** Store tool credentials per-integration per-workspace in an integrations table.
**Why:** Sprint 1 uses env vars for Jira/GitHub tokens. Multi-user and marketplace require credentials stored with the integration, not in the environment.
**Context:** When a user installs an integration from the marketplace, they configure the connection (API URL, token). Credentials are stored encrypted in Postgres, loaded by the engine when a tool_call needs them. ToolCallExecutor receives credentials via ExecutionContext, not process.env.
**Effort:** M | **Priority:** P2 | **Depends on:** Sprint 1 tool adapters working

## Evaluate Temporal for Execution Durability

**What:** Evaluate Temporal.io as the execution durability layer for Sprint 2.
**Why:** In-process execution (setImmediate) means server restarts kill running procedures. Sprint 2 web UI needs executions to survive restarts.
**Context:** Current architecture persists currentNodeId + variables + ExecutionNode records to Postgres. A resumeFromNode() method could reload state and continue. Temporal provides this out of the box with automatic retry, saga patterns, and activity heartbeats. Evaluate whether the simple Postgres approach is sufficient or if Temporal's guarantees are needed.
**Effort:** S (evaluation) | **Priority:** P1 | **Depends on:** Sprint 1 complete

## Internal Dashboard (Sprint 3)

**What:** Build `apps/ops/` (Next.js admin UI) + `apps/internal-api/` (sudo APIs) as a separate internal dashboard.
**Why:** Need a way to manage the platform without SSH — seed SOPs, view all executions/traces, manage integrations, kill stuck executions, run migrations. Also needed for the external demo (Sprint 3 exit criteria).
**Context:** Separate from the product UI and API. Google OAuth with email allowlist for access control. Direct Prisma DB access (same Neon, elevated permissions). Deploys as a separate Render service with its own URL and env vars. Inspired by the Flywl Nexus pattern — ops UI is never mixed with customer-facing product.
**Effort:** M | **Priority:** P1 | **Depends on:** Sprint 2 complete (product API and web UI working)
