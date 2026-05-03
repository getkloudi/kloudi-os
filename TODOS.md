# TODOS

**Last updated:** 2026-05-03
**Read first:** `docs/current/00-start-here.md`

---

## P0 — Do before anything else

### Encrypt credentials in Integration model

`packages/core/prisma/schema.prisma` — `credentials Json` stores secrets as plain JSON.
Add AES-256-GCM encryption at application layer before storing, decrypt on read.
**File:** `packages/core/organization/integration-service.ts` (wherever Integration is read/written)

---

## P1 — Do before any real user touches this

### CLI ls/trace have no auth

`apps/cli/commands/ls.ts` and `apps/cli/commands/trace.ts` call the API with no auth headers. Will 401.
Add API key or session token to all CLI API calls.

### kloudi init creates orphaned org

`apps/cli/commands/init.ts` — creates Organization but no Membership linking the user to it.
Create Membership in the same transaction as Organization.

### Remove --accept-data-loss from init

`apps/cli/commands/init.ts` — `prisma db push --accept-data-loss` is dangerous in production.
Remove flag. Use proper migrations (`prisma migrate deploy`).

### Seed script hardcodes 'default-org'

`apps/cli/commands/init.ts` seed logic — uses literal string instead of org from context.
Use org slug derived from the created org.

### DESIGN.md still says "lore.dev" in Decisions Log

`DESIGN.md` Decisions Log at the bottom references old product name in some entries.
Review and update any remaining "lore.dev" or "procedure" strings.

---

## P2 — Do after P1 is clean

### Orphaned execution cleanup

Add startup check (or periodic job) that finds executions stuck in `running` for >1 hour and marks them `failed`.
Server restarts leave orphans. Affects: `apps/api/index.ts` startup sequence.

### Execution resume-from-node

Add `POST /api/executions/:id/resume` — loads prior `ExecutionNode` outputs and continues from the specified node.
Stub exists in `apps/api/routes/executions.routes.ts`. Implement once AI-native engine is built.

### Internal dashboard deploy

`apps/ops/` + `apps/internal-api/` shipped in PR #8 but never deployed.
Configure Google OAuth credentials, set `OPS_ALLOWED_EMAILS`, deploy to Render + Vercel.

---

## P3 — Nice to have

### Dry-run mode

Add `dryRun: true` flag to the AI-native engine — traverses graph validating tool availability and variable resolution without making LLM calls.
Catches SOP authoring mistakes cheaply before burning tokens.

### Fix (db as any) Prisma casts

Type casts in capability classes bypass Prisma's type safety.
Fix Prisma client typing so `(db as any)` isn't needed.

---

## V0 Build — parallel workstreams

These are the core V0 build tasks. All can run in parallel once interface contracts are defined.
See `docs/current/product-architecture.md` for the full module map.

### [AGENT 1] MCP Gateway

**Package:** `packages/mcp-gateway/` (new — create from scratch)
**What:** Federated MCP gateway. Single interface for all tool calls. Routes to GitHub, Jira, or builtin tools. Injects credentials from Integration table. Runs trust inspector pipeline before every execution. Will be open-sourced as a neutral project.
**Auth model:** Org-level (shared token for all agents in org) + User-level (personal token, actions attributed to user).
**Unblocked:** Start now.
**Delivers:** `gateway.call(toolName, params, orgContext)` interface + GitHub MCP + Jira MCP + builtin tools (read_file, write_file, bash).

### [AGENT 2] Graph Derivation Engine

**Package:** `packages/core/graph-derive/` (new — replaces old `import/skill-to-graph.ts`)
**What:** Reads SOP markdown, sends to LLM, derives `.graph.json` matching SopNode schema (description, context_sources, available_tools, trust_required). AI-powered, not rule-based.
**Unblocked:** Start now. SopNode schema already defined in seed SOPs.
**Delivers:** `deriveGraph(markdown: string) → SopNode[]`

### [AGENT 3] kloudi-fs

**Package:** Separate repo (open source)
**What:** Agent filesystem. Copy Mesa's approach, build our own. FUSE mount + versioning + TypeScript SDK. Each org = one repo. kloudi.os is the first consumer. Will be donated to ecosystem.
**Unblocked:** Start now.
**Delivers:** `read/write SOP files`, bidirectional sync with Postgres jsonb
**Brief:** `docs/future/session-g-kloudi-fs.md`

### [AGENT 4] AI-Native Execution Engine

**Package:** `packages/core/execution/engine.ts` (new — replaces deleted `execution-engine.ts`)
**What:** The inner loop from `docs/current/agent-loop-design.md`. LLM is control flow. SOP graph provides context assembly path. Vercel AI SDK for LLM calls. MCP Gateway for tools.
**Depends on:** Agent 1 (MCP Gateway interface — can mock for first 2 days)
**Delivers:** `runSop(sopId, params, orgContext) → EventStream`

### [AGENT 5] REPL Loop / CLI

**Package:** `apps/cli/` (extend existing)
**What:** Outer conversational loop. Machine speaks first. User converses. Drives inner engine. Pi's EventStream pattern + OpenCode's session management.
**Depends on:** Agent 4 engine interface
**Delivers:** `kloudi` REPL — Machine greets, user talks, trust gates inline

### [AGENT 6] Web App + wterm

**Package:** `apps/web/` (extend existing)
**What:** wterm in right panel connected to agent loop via WebSocket. Markdown SOP editor with auto-derive (calls Agent 2 on save). Feed cards with approval buttons.
**Depends on:** Agent 4 EventStream interface + Agent 2 derive
**Delivers:** wterm works, markdown editor derives graph on save, feed shows execution cards

---

## Design needed before code

These need a design session before implementation. Briefs in `docs/future/`.

| What                                                      | Where                                       | Stage   |
| --------------------------------------------------------- | ------------------------------------------- | ------- |
| DB schema for agent sessions + feed events + trust scores | `docs/future/session-c-db-schema.md`        | Stage 1 |
| Editor framework: markdown + map + reading views          | `docs/future/session-b-editor-framework.md` | Stage 2 |
| Background mode: observer + planner                       | No brief yet                                | Stage 2 |
| Backlink system for SOP knowledge network                 | No brief yet                                | Stage 2 |
| Trust model: per-user evolving scores                     | No brief yet                                | Stage 2 |
| Onboarding mode: scan org + generate SOPs                 | `docs/future/session-d-onboarding-mode.md`  | Stage 3 |
| Learning mode: trace analysis + SOP proposals             | No brief yet                                | Stage 3 |
