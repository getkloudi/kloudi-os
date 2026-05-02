# TODOS

Deferred work tracked from plan reviews. Each item has context so a future engineer understands why it exists.

**Last reviewed:** 2026-04-15 against The Machine design session (docs/session-2026-04-13/00-session-summary.md).

---

## ~~Sprint 1.5: Extended Node Types~~ SUPERSEDED

**What:** Add `parallel`, `loop`, `condition`, and `transform` node types to the ExecutionEngine.
**Status:** Superseded by The Machine's AI-native execution model.
**Why superseded:** Design session (Part 1.6) decided the LLM IS the control flow. The SOP graph is a directed path for context assembly, not a program with branching. The LLM reasons at each step whether to follow, adapt, retry, or ask the user. Hard-coded `parallel`/`loop`/`condition` node types are "human-written branching logic — the old way." The graph provides direction; the LLM provides judgment.
**What replaces it:** The AI-native execution engine design (Open Question #7 in session summary). The LLM handles branching, parallelism, and conditionals as emergent behavior from reasoning over the SOP context.
**Action:** Remove from sprint plan. Design the AI-native engine instead (see Open Questions below).

## ~~Background Worker Process (queue technology TBD)~~ NEEDS REDESIGN

**What:** Move graph execution from in-process `setImmediate()` to a background worker.
**Status:** Original framing superseded. pg-boss explicitly rejected by Nitish. But the NEED is confirmed — Background Mode (Part 2.1) requires server-side execution without a terminal.
**Why still needed:** The Machine operates in Background Mode — watching webhooks, generating plans, executing SOPs, posting to feed — all without a user terminal open. This is more than a "job queue." It's the Machine's autonomous operation loop.
**What replaces pg-boss:** Open Question #10 in session summary. Candidates: (1) Vercel's durable workflow pattern from Open Agents (ToolLoopAgent), (2) Simple Postgres polling with the agent loop owning execution lifecycle, (3) The agent loop itself IS the background process (no separate queue — the Machine's server-side agent runs continuously). The right answer likely emerges from the AI-native engine design.
**Effort:** M-L | **Priority:** P1 | **Depends on:** AI-native engine design
**Action:** Redesign as part of the AI-native execution engine + Background Mode architecture.

## Sprint 2: Execution Resume-From-Node — CONFIRMED

**What:** Add `resumeFrom(executionId, nodeId)` to the ExecutionEngine.
**Why still relevant:** Context assembly model (Part 1.3) makes this MORE important. If the graph assembles context step by step and fails at step 4, you don't want to re-run steps 1-3 (re-reading PRD, architecture, schema). Resume lets you pick up with context already assembled.
**Context:** Sprint 1 stores all node inputs/outputs in ExecutionNode records. Resume loads prior outputs into `ctx.variables` from stored ExecutionNode records, then continues traversal from the specified node. Needs a new API endpoint: `POST /api/executions/:id/resume`.
**Note:** Implementation may change shape when execution becomes AI-native, but the concept is confirmed.
**Effort:** M | **Priority:** P2 | **Depends on:** Sprint 1 engine + AI-native engine design

## Dry-Run Mode for Execution Validation — CONFIRMED

**What:** Add a `dryRun: true` flag to `engine.execute()` that traverses the graph validating executor availability, variable resolution, and graph structure without making any LLM/tool calls.
**Why still relevant:** Even with AI-native execution, the graph is still a directed path with nodes referencing tools and variables. Dry-run catches authoring mistakes before burning LLM tokens. Even more valuable now — context assembly (Part 1.3) means each node expects specific prior context. Dry-run can verify the assembly chain is complete.
**Effort:** S | **Priority:** P3 | **Depends on:** Sprint 1 engine working

## Orphaned Execution Cleanup — CONFIRMED

**What:** A startup check or periodic job that finds executions stuck in `running` status for >1 hour and marks them as `failed`.
**Why still relevant:** Regardless of execution model (deterministic graph walker or AI-native), server restarts can orphan running executions. Background Mode (always-on) reduces but doesn't eliminate this — deploys still restart the server.
**Effort:** S | **Priority:** P2 | **Depends on:** Sprint 1 engine working

## ~~Import Remaining 41 Gstack Skills as SOPs~~ SUPERSEDED

**What:** Manually convert remaining 41 gstack skills to SOP graph JSON and import into Postgres.
**Status:** Superseded by Onboarding Mode (Part 2.1).
**Why superseded:** Onboarding Mode IS automated SOP extraction. The Machine connects to org's tools, scans artifacts, and reverse-engineers how the org actually works — generating SOPs automatically. The manual "30 min per skill with CC" approach is exactly what Onboarding Mode replaces. The Flywl mapping (44 skills, 8 repos) was cited as the manual version of what Onboarding Mode automates.
**What replaces it:** Onboarding Mode research agent. When we onboard Flywl (or any org), the Machine scans the repos and generates SOPs. Manual import only needed for skills that can't be inferred from artifacts.
**Action:** Remove from sprint plan. Build Onboarding Mode instead (Layer 5 in build order).

## Per-Integration Credential Storage — PARTIALLY DONE, P0 BLOCKER REMAINS

**What:** Store tool credentials per-integration per-workspace encrypted in Postgres.
**Status:** PR #7 shipped the Integration model with `credentials Json @default("{}")`. The table exists. Credentials ARE stored per-integration per-org. But they're **plain JSON** — not encrypted. This is a P0 from the session review (Part 6).
**What's done:** Integration model exists, CRUD works, credentials stored per-integration.
**What's NOT done:** Encryption. `credentials` column is plain JSON (`// plain JSON for now` in schema). Needs encryption at rest before any real credentials are stored.
**Effort:** S | **Priority:** P0 | **Depends on:** Nothing — can do now
**Action:** Encrypt credentials column. Use `pgcrypto` or application-level encryption (AES-256-GCM).

## ~~Evaluate Temporal for Execution Durability~~ SUPERSEDED

**What:** Evaluate Temporal.io as the execution durability layer.
**Status:** Superseded by The Machine architecture decisions.
**Why superseded:** The design session evaluated Open Agents/Vercel's durable workflow pattern (ToolLoopAgent) and decided to build the agent loop in TypeScript studying patterns from Pi, OpenCode, Goose, Hermes, OpenClaw, and Open Agents (Part 3: Agent Loop). The execution durability question is now subsumed by the AI-native engine design + Background Mode architecture. Temporal is a heavyweight dependency for what may be achievable with Postgres-persisted state + the agent loop's own lifecycle management.
**What replaces it:** The agent loop design (build own in TypeScript). Durable workflows via Postgres state persistence (currentNodeId + variables + ExecutionNode records already exist). The agent loop owns its own retry/resume semantics.
**Action:** Remove as separate evaluation. Durability is now a property of the agent loop + AI-native engine, not a separate infrastructure decision.

## ~~Internal Dashboard (Sprint 3)~~ DONE

**Status:** Shipped in PR #8 (2026-04-12). Scaffolded `apps/ops/` (Next.js admin UI) + `apps/internal-api/` (Express sudo APIs). CI fix in PR #10.
**Remaining:** Deploy to Render + Vercel, configure Google OAuth credentials, set env vars on services.

---

## PR #7 Blockers (from design session review)

These were identified during the session (Part 6) and need fixing:

### P0: Plain-text credentials in Integration model

**What:** `credentials Json` in Integration stores secrets as plain JSON.
**Action:** Add application-level encryption (AES-256-GCM) before storing, decrypt on read.

### P1: CLI ls/trace have no auth

**What:** CLI commands `kloudi ls` and `kloudi trace` call API without auth headers. Will 401.
**Action:** Add API key or token auth to CLI commands.

### P1: kloudi init creates orphaned org

**What:** `kloudi init` creates an Organization but no Membership linking the user to it.
**Action:** Create Membership in the same transaction as Organization.

### P1: --accept-data-loss flag in init

**What:** `prisma db push --accept-data-loss` in the init command. Dangerous in production.
**Action:** Remove flag, use proper migrations.

### P1: Seed script uses 'default-org' literal

**What:** Seed script hardcodes 'default-org' instead of using the org from context.
**Action:** Use org from CLI context or .env.

### P2: (db as any) casts bypass Prisma typing

**What:** Type casts in capability classes bypass Prisma's type safety.
**Action:** Fix Prisma client typing so casts aren't needed.

---

## Open Design Questions (from session)

These are NOT implementation items — they need design sessions before code:

1. AI-native execution engine design (LLM as control flow) — **BIGGEST OPEN QUESTION**
2. Background job technology (pg-boss rejected, agent loop approach TBD)
3. Backlink system for SOP knowledge network
4. Onboarding Mode research agent + evaluation engine
5. Learning Mode scoring mechanism
6. Trust model design (Person of Interest metaphor → concrete data model)
7. Graph Editor UX
8. Agent context handoff (Machine → Claude Code)
9. Cloud sandboxes for multi-tenant execution

---

## Session Contradictions to Resolve

From session Part 7 — need cleanup before next implementation:

1. CEO plan references AgentFS — rejected in design session
2. CEO plan has /marketplace/ in filesystem — marketplace is apps in nav rail
3. DESIGN.md says "lore.dev", everything else says "kloudi.os"
4. CLAUDE.md still references "procedures" in places, should be "SOPs"
