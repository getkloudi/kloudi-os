# TODOS

**Last updated:** 2026-05-04
**Read first:** `docs/current/00-start-here.md`

---

## ✅ Done (this session)

| Item                                                               | PR    |
| ------------------------------------------------------------------ | ----- |
| Encrypt credentials in Integration model (AES-256-GCM)             | #12   |
| CLI ls/trace auth headers                                          | #12   |
| Remove `--accept-data-loss` from init                              | #12   |
| Better Auth replacing custom JWT                                   | #12   |
| Resend email integration                                           | #12   |
| Stripe billing foundation + UsageEvent model                       | #12   |
| MCP Gateway — GatewayImpl, registry, providers, inspectors, tools  | #13   |
| Old executor classes deleted (LLMExecutor, ToolCallExecutor, etc.) | local |
| Decision + Pattern models deleted                                  | local |
| Seed SOPs rewritten to new AI-native node schema                   | local |
| All docs organised into current/future/archive/trash               | local |
| All docs Obsidian-ready (Mermaid, callouts, TOC)                   | local |

---

## P0 — Before any external user

### MCP Gateway: credential decryption not wired

`packages/mcp-gateway/src/server.ts` — reads encrypted credentials from Postgres and passes raw blobs to tool adapters. GitHub/Jira calls fail. PR #12 encrypted credentials; the gateway needs to call `decryptCredentials()` from `packages/core/organization/integration-service.ts`.

### MCP Gateway: no authentication on HTTP API

`packages/mcp-gateway/src/server.ts` — `POST /tools/call` has no auth. `organizationId` is caller-supplied and unverified. Any caller can execute tools using any org's credentials.
**Fix:** API key middleware. Key → org mapping server-side. Run the MCP Gateway production /plan-eng-review session (`docs/current/session-plan-eng-review-mcp-gateway.md`) before implementing.

### MCP Gateway: no usage recording

`recordUsage()` in `packages/platform/src/billing.ts` is never called. Every successful tool call must emit a `UsageEvent` for billing.

---

## P1 — Before charging money

### kloudi init creates orphaned org

`apps/cli/commands/init.ts` — creates Organization but no Membership. Requires logged-in userId from Better Auth CLI flow (not yet implemented). Tracked as a `// TODO` comment in the file.

### Seed script hardcodes slug

`apps/cli/commands/init.ts` — uses literal string instead of org slug from context. Minor.

### MCP Gateway: rate limiting

No per-org rate limiting. Needed before any paying customer.

### MCP Gateway: input validation

`POST /tools/call` has no Zod validation. Malformed requests cause unhandled crashes.

### MCP Gateway: error response scrubbing

`err.message` exposed to callers in 500 responses — can leak internal details.

### Schema migration: drop old auth tables

`users`, `sessions`, `organizations`, `memberships` tables still exist in any DB that ran the old JWT schema. `prisma migrate deploy` won't drop them. Write a migration script before first production deploy.

---

## P2 — After P1 is clean

### Orphaned execution cleanup

Executions stuck in `running` for >1 hour never get marked `failed`. Affects `apps/api/index.ts` startup.

### Execution resume-from-node

`POST /api/executions/:id/resume` — stub exists, implement once AI-native engine is built.

### Internal dashboard deploy

`apps/ops/` + `apps/internal-api/` shipped in PR #8 but never deployed. Configure Google OAuth, deploy to Render + Vercel.

### MCP Gateway: path sanitization for builtin tools

`read_file` and `write_file` accept arbitrary paths. No bounds checking against an allowed-paths list.

---

## P3 — Nice to have

### Dry-run mode for execution engine

Validates graph without making LLM calls. Catches authoring mistakes cheaply.

### Fix (db as any) Prisma casts

Type casts bypass Prisma's type safety throughout capability classes.

---

## V0 Build — parallel workstreams

Agent 1 (MCP Gateway) is DONE. Three agents can start in parallel now.

| Agent                         | Status            | Package                             | Depends on        |
| ----------------------------- | ----------------- | ----------------------------------- | ----------------- |
| **Agent 1: MCP Gateway**      | ✅ DONE (PR #13)  | `packages/mcp-gateway/`             | —                 |
| **Agent 2: Graph Derivation** | 🔲 Ready to start | `packages/core/graph-derive/`       | Nothing           |
| **Agent 3: kloudi-fs**        | 🔲 Ready to start | Separate repo                       | Nothing           |
| **Agent 4: Execution Engine** | 🔲 Ready to start | `packages/core/execution/engine.ts` | Agent 1 ✅        |
| **Agent 5: REPL Loop / CLI**  | ⏳ Blocked        | `apps/cli/`                         | Agent 4           |
| **Agent 6: Web App + wterm**  | ⏳ Blocked        | `apps/web/`                         | Agent 4 + Agent 2 |

**Prompts:**

- Agent 2: `docs/current/agent-2-graph-derive-prompt.md`
- Agent 3: `docs/current/agent-3-kloudi-fs-prompt.md`
- Agent 4: `docs/current/agent-4-execution-engine-prompt.md`

---

## MCP Gateway production sessions (run before P0 fixes)

Run these before implementing auth/billing/rate limiting for the gateway:

1. **`docs/current/session-office-hours-mcp-gateway.md`** — product direction, narrowest wedge, what features are actually needed vs OpenRouter/AI SDK
2. **`docs/current/session-plan-eng-review-mcp-gateway.md`** — lock production architecture: auth model, billing pipeline, trust layer decision, rate limiting, deployment topology

---

## Design needed before code

| What                                                      | Where                                       | Stage   |
| --------------------------------------------------------- | ------------------------------------------- | ------- |
| DB schema for agent sessions + feed events + trust scores | `docs/future/session-c-db-schema.md`        | Stage 1 |
| Editor framework: markdown + map + reading views          | `docs/future/session-b-editor-framework.md` | Stage 2 |
| Background mode: observer + planner                       | No brief yet                                | Stage 2 |
| Backlink system for SOP knowledge network                 | No brief yet                                | Stage 2 |
| Trust model: per-user evolving scores                     | No brief yet                                | Stage 2 |
| Onboarding mode: scan org → generate SOPs                 | `docs/future/session-d-onboarding-mode.md`  | Stage 3 |
| Learning mode: trace analysis + SOP proposals             | No brief yet                                | Stage 3 |
