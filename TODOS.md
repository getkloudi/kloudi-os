# TODOS

**Last updated:** 2026-05-02
**Read first:** `docs/current/00-start-here.md`

---

## P0 — Do before anything else

### Encrypt credentials in Integration model

`packages/core/prisma/schema.prisma` — `credentials Json` stores secrets as plain JSON.
Add AES-256-GCM encryption at application layer before storing, decrypt on read.
**File:** `packages/core/sops/` capabilities layer (wherever Integration is read/written)

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

### DESIGN.md still says "lore.dev"

`DESIGN.md` header/references still use old product name.
Replace all instances of "lore.dev" → "kloudi".

---

## P2 — Do after P1 is clean

### Orphaned execution cleanup

Add startup check (or periodic job) that finds executions stuck in `running` for >1 hour and marks them `failed`.
Server restarts leave orphans. Affects `packages/core/execution/execution-engine.ts`.

### Execution resume-from-node

Add `POST /api/executions/:id/resume` — loads prior `ExecutionNode` outputs into `ctx.variables` and continues from the specified node.
Critical for AI-native engine: don't re-run context assembly steps 1-3 when step 4 failed.

### Internal dashboard deploy

`apps/ops/` + `apps/internal-api/` shipped in PR #8 but never deployed.
Configure Google OAuth credentials, set `OPS_ALLOWED_EMAILS`, deploy to Render + Vercel.

---

## P3 — Nice to have

### Dry-run mode

Add `dryRun: true` flag to `engine.execute()` — traverses graph validating tool availability and variable resolution without making LLM calls.
Catches SOP authoring mistakes cheaply before burning tokens.

### Fix (db as any) Prisma casts

Type casts in capability classes bypass Prisma's type safety.
Fix Prisma client typing so `(db as any)` isn't needed.

---

## Design needed before code

These need a design session before implementation. Briefs in `docs/future/`.

| What                                                      | Where                                       | Stage   |
| --------------------------------------------------------- | ------------------------------------------- | ------- |
| DB schema for agent sessions + feed events + trust scores | `docs/future/session-c-db-schema.md`        | Stage 1 |
| Background mode: observer + planner                       | No brief yet                                | Stage 2 |
| Backlink system for SOP knowledge network                 | No brief yet                                | Stage 2 |
| Trust model: per-user evolving scores                     | No brief yet                                | Stage 2 |
| Editor framework: markdown + map + reading views          | `docs/future/session-b-editor-framework.md` | Stage 2 |
| Onboarding mode: scan org + generate SOPs                 | `docs/future/session-d-onboarding-mode.md`  | Stage 3 |
| Learning mode: trace analysis + SOP proposals             | No brief yet                                | Stage 3 |
