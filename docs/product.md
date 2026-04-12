# docs/product.md — kloudi.os

> The durable artifact isn't the code the agent writes. It's this file. Every chat is an experiment. Only decisions that survive get committed here.

**Last updated:** 2026-04-12 **Status:** Significant code built. Vision locked via office hours + CEO review. **Stack:** TypeScript, Next.js, Prisma, Turborepo, pnpm

---

## WHY — The Insight

**The core insight (Jan 9, 2026):** PRDs, technical specs, workflows, deployment runbooks, and automation scripts are all the same thing at different abstraction levels. They define procedures. One table. One graph structure. One execution engine.

**The worldview (sharpened Apr 11, 2026):** The agent IS the product. Not the procedure system. Not the execution engine. The agent. Procedures are its brain. Personas are its roles. Trust gates are its governance. kloudi.os is an organizational agent that fills any role, backed by SOPs that capture how each role works.

**Why now:** AI coding agents (Claude Code, Cursor, Copilot) have proven that AI can execute complex workflows. But their productivity is trapped in engineering. Product managers, designers, leaders don't get the same leverage. The opportunity: extend AI leverage to the whole org via executable procedures. The window: 12-18 months before an incumbent (Cursor, Linear, GitHub Copilot) absorbs the core idea. The architectural insight is 6-12 months ahead. The implementation is 6-12 months behind. These cancel out. Ship now.

---

## WHAT — The Product

kloudi.os is an agent-first organizational OS. SOPs are the universal file format — like `.doc` for documents, but for "how we do things." Any agent can connect, read SOPs, execute them in its native format, and capture traces.

### Ratcheted decisions (never reversed across 30+ conversations + office hours + CEO review)

**1. Everything is an SOP**

- PRDs, ERDs, tech specs, deployment scripts, code review checklists — all SOPs at different abstraction levels
- A PRD IS an SOP for "what problem to solve and for whom." An ERD IS an SOP for "how data relates."
- All stored in one table. Graph structure: nodes + conditional edges, not sequential steps.
- RFC 2119 constraints: MUST/SHOULD/MAY for control
- **Naming:** "SOP" is the only term. Not "procedure," not "workflow," not "process." SOP everywhere — code, API, database, UI, docs. The codebase currently uses `Procedure` / `procedural_entities` — this gets renamed to `SOP` / `sops` as part of Sprint 1 prep. The rename is intentional: "procedure" sounds clinical and bureaucratic. "SOP" is what operators, engineers, and teams actually say. Consistency in naming is how an OS earns clarity.

**2. Filesystem-first**

- Database is truth, filesystem is navigation
- Only 3 default directories: `/guides/`, `/projects/`, `/integrations/` (marketplace)
- Everything else is user-created (`/tasks/`, `/skills/`, `/runbooks/`, whatever the org needs)
- The OS doesn't impose a hierarchy. Teams name and organize their SOPs however makes sense.
- CLI, MCP, and UI all access the same underlying system
- Unix permissions model (rwx, owner:group) — don't reinvent RBAC

**3. Governance density is the single scaling axis**

- One product, one architecture. Not feature tiers.
- Solo dev: agent IS your entire team (PM, designer, QA, support). Zero gates.
- Small team (5-10): agent fills gaps. No QA? Agent does it. No full-time PM? Agent drafts PRDs.
- Growing team (30-100): agent augments humans with institutional memory and consistency.
- Large org (500+): agent enforces governance (audit trails, multi-approval, compliance).
- Same kernel, same SOPs, same personas. ICP detection from signals.

**4. 5 personas, species-agnostic**

- Engineer, PM, Design, Infra, QA
- Each can be human OR agent
- Capabilities are per-persona, not per-species

**5. 7 universal workflows**

- Define, Design, Implement, Test, Deploy, Monitor, Learn
- Every software team does exactly these 7 things
- The OS makes all 7 executable, traceable, governable
- All 7 already have gstack skill implementations (44 skills across these categories):

| Workflow | What it does | Existing gstack skills | Sprint |
|----------|-------------|----------------------|--------|
| Define | Scope problems, write PRDs | office-hours, draft-prd, plan-ceo-review | 2 |
| Design | Design systems, review UI | design-consultation, design-review, plan-design-review | 2 |
| Implement | Write code from specs | engineering:impl, engineering:write-erd | **1** |
| Test | QA, find + fix bugs | qa, qa-only, engineering:qa-sign-off | **1** |
| Deploy | Ship, merge, verify | ship, land-and-deploy, setup-deploy | **1** |
| Monitor | Post-deploy health | canary, benchmark | 3 |
| Learn | Retrospectives, patterns | retro, learn | 3 |

- Sprint 1 imports 3 skills: one from Implement, Test, and Deploy (the inner loop)
- Sprint 2 projection layer enables bulk import of remaining skills
- The 7 workflows are the SOP taxonomy — `/guides/` contains the workflow definitions, `/projects/` contains instances

**6. Intelligent VM pattern (can ship incrementally)**

- Interpolative nodes: model decides control flow at forks
- User as tool call: `user.ask` is just another tool, not special
- Harness abstraction: swappable loop/executor/filesystem/context interfaces
- Continuous mode: wake conditions, event-driven (deferred — build triggered first)
- VM system prompt: tells model it's a VM, not a chatbot

**7. Marketplace = 3 marketplaces**

- SOPs: install procedures from community
- Apps: viewers/editors for SOPs (like vim, VS Code, Google Docs — the OS provides the filesystem, apps provide the editing experience)
- Executors: humans, consultants, agents — all assignable through same interface

**8. The Figma analogy**

- Everyone on one canvas with RBACs
- Role-adaptive views: same SOP looks different to PM vs engineer vs DevOps
- Multiplayer and collaborative — the OS analogy but real-time

**9. The agent IS the product** (Apr 11, 2026)

- The product isn't "a procedure management system." It's "an agent that joins your team."
- Procedures are its brain. Personas are its roles. Trust gates are its governance.
- Codex (GPT-5.4) validated: the product is a "trust-construction system" — scoped permissions, visible reasoning, approval checkpoints, replay from past runs.

**10. Agent-agnostic platform** (Apr 12, 2026)

- kloudi.os works with ANY agent: kloudi CLI, Claude Code, Cursor, Codex, any future agent
- SOPs are the universal format. Agent-native skill files (SKILL.md, .cursorrules) are projections of SOPs.
- The platform exposes APIs. Agents are clients.

**11. Full-fidelity projection** (Apr 12, 2026)

- The SOP must be a complete lossless representation
- If a SKILL.md is deleted, the projection regenerates it with 100% accuracy
- Same SOP on a different platform (Cursor) produces equivalent .cursorrules
- Different translation layers for different agents — each understands the target agent's format

**12. SOP authoring via marketplace apps** (Apr 12, 2026)

- Like macOS: the OS provides the filesystem, apps provide the editing experience
- Default app ships with the OS (basic viewer/editor, like TextEdit)
- Marketplace apps provide specialized editors, visual graph builders, etc.
- Full authoring UI is a marketplace app, not a built-in feature

**13. UI ships alongside CLI** (Apr 12, 2026)

- Deferring UI is a pre-AI constraint. AI makes building UI cheap.
- The v6 mockup already exists (docs/designs/design-preview-v6.html)
- The Next.js app is deployed on Vercel
- Ship the web UI in Sprint 2, not "Phase 2"

**14. SOP completeness requires org-level context** (Apr 12, 2026)

- A procedure alone isn't enough for an agent to execute well
- The agent also needs: org design decisions, engineering conventions, product strategy, API standards
- These are themselves SOPs at the guide level
- The SOP hierarchy provides completeness: guides provide context, projects provide scope, custom levels provide execution
- When porting an existing org, think agent-first (what does the agent need to understand this org?)

**15. AgentFS is the agent's filesystem interface** (Apr 12, 2026)

- Provides filesystem abstraction for agents (read/write files, kv context, tool call audit)
- Backend is pluggable: SQLite for local dev, S3 for cloud
- NOT just storage — it's the FUSE/NFS layer from the conversation vision
- Reference: github.com/tursodatabase/agentfs

**16. Code repos are workspaces, not SOPs** (Apr 12, 2026)

- Code repos are where SOPs execute. Code is the artifact produced by running SOPs.
- Per-repo CLAUDE.md and .cursorrules are generated from repo-level SOP overrides
- SOPs reference repos as execution targets

### What's in v1: 3 sprints, 6 weeks

**Sprint 1 (Days 1-14): THE PROOF** — "One SOP runs end-to-end with trust gates"
- Rename `Procedure` → `SOP` across codebase (model, table, routes, types). One atomic rename before building on top.
- Fix trust layer (see trust layer design below)
- Import 3 skills as SOPs into Postgres
- Run /engineering/impl through execution engine with real Jira + GitHub
- Approval gates stop before risky actions, show reasoning, wait for y/n
- Trace captures reasoning, tool calls, approvals per node
- Exit: demo video of one SOP executing with working trust gates

**Sprint 2 (Days 15-28): THE PRODUCT** — "CLI + Web UI + SOP projection"
- kloudi CLI: init, ls, run, trace
- Web UI: v6 design (home feed, procedure browser, trace viewer)
- SOP → SKILL.md projection (Claude Code skills generated FROM kloudi.os SOPs)
- SKILL.md → SOP import (onboarding path for existing orgs)
- Exit: team uses kloudi.os for real work. Generated skills work as well as hand-written.

**Sprint 3 (Days 29-42): THE PITCH** — "Onboarding agent + external demo"
- Onboarding agent: guided first-run (what tools? → import workflows → first SOP)
- Show to Abhijit Kane and Shamasis (live pair session)
- Fix issues from external feedback
- Exit: one external person has seen kloudi.os and given feedback

**Explicitly deferred:** Continuous execution, marketplace, extraction engine, cross-department personas, AIGNE integration, FUSE mounting, heartbeat/cron.

### SOP ↔ SKILL.md projection (Sprint 2 deliverable)

The projection layer converts between kloudi.os SOPs (graph in Postgres) and agent-native skill files (SKILL.md, .cursorrules, etc.). Decision #11 says "full-fidelity, lossless." Here's what that means concretely.

**SOP → SKILL.md (projection):**

An SOP record contains:
```
Procedure { name, slug, description, level, maturity,
            graph: { nodes: GraphNode[], edges: GraphEdge[] },
            parameters, constraints, tags, metadata }
```

A SKILL.md file contains:
```yaml
---
name: {slug}
version: {metadata.version || "1.0.0"}
description: {description}
allowed-tools: {derived from node types — llm nodes need no tools, tool_call nodes declare their tools}
---
{markdown body: instructions derived from graph traversal}
```

**The translation algorithm:**
1. Topological sort the graph (entry node first, terminal nodes last)
2. For each node, emit a markdown section:
   - `llm_generate` → prose instruction with the prompt template
   - `tool_call` → bash code block with the tool invocation
   - `interpolative` → numbered decision list ("If X, do Y. Otherwise, do Z.")
   - `sub_entity` → reference to another SOP (`Run /path/to/child-sop`)
3. Conditional edges become "If [condition]..." prose
4. Constraints (MUST/SHOULD/MAY) become inline annotations
5. Parameters become a "## Parameters" section at the top

**SKILL.md → SOP (import):**
1. Parse YAML frontmatter → name, description, version
2. Parse markdown body → sections become nodes
3. Bash code blocks → `tool_call` nodes
4. Decision lists (numbered, "If...") → `interpolative` nodes
5. Prose instructions → `llm_generate` nodes
6. Cross-references (`Run /path/...`) → `sub_entity` nodes
7. Section order → edges (linear by default, branching where "If" detected)
8. Set level based on path: `/guides/` → guide, `/projects/` → project, `/skills/` → skill

**What "full-fidelity" means in practice:**
- Delete the SKILL.md → regenerate from SOP → identical output (modulo whitespace)
- The SOP is the source of truth. The SKILL.md is a view.
- Edits to SKILL.md in a repo are detected as drift and flagged (not auto-merged in v1)

**What's NOT full-fidelity in Sprint 2:**
- Preamble bash (gstack-specific boilerplate) — not round-trippable, stripped on import
- Complex control flow (loops, parallel nodes) — deferred node types
- Codex challenged this: "not credible without canonical AST." Sprint 2 proves it works for the 4 node types we have. Complex cases are acknowledged as future work.

**Sprint 2 exit criterion:** Import 3 existing gstack skills → SOP records in Postgres → regenerate SKILL.md → output works identically when used via Claude Code.

---

## WHO — The First User

**Target:** Engineering leads at 30-100 person startups who have lost a senior engineer and watched months of productivity evaporate as the team relearned deployment, incident response, and code review patterns.

**Narrowest wedge:** "Here's an agent that knows how your team works. It can run your deploy, triage your incidents, review your PRs — and it shows you what it's doing, asks before risky actions, and remembers everything."

### Before and after: Prashant's Monday morning

**The job to be done:** When a senior engineer leaves and takes institutional knowledge with them, the engineering lead needs to prevent the team from regressing to slow, error-prone, human-guarded processes — without becoming the single point of failure themselves.

**Before kloudi.os (today at Flywl):**

Prashant (VP Engineering) starts Monday. A deploy is queued. The engineer who owned deploys left 2 months ago. What used to be a solo 15-minute operation is now a 3-person ceremony: one runs the script, one watches the dashboard, Prashant approves each step because nobody trusts the process yet. Total time: 45 minutes, 3 people blocked.

A bug report comes in from production. The on-call engineer spends 40 minutes gathering context — which service, what changed recently, what's the runbook — before they can even form a hypothesis. The runbook is a stale Notion page that references infrastructure that was replaced 4 months ago.

A new hire asks "how do we do code reviews here?" Prashant says "look at how Sneha used to do them" and points to 3 old PRs. The new hire copies the pattern but misses the architectural conventions Sneha enforced because those were in her head, not written down.

**After kloudi.os:**

Monday. Deploy is queued. The new hire runs `kloudi run /projects/api/deploy`. The agent follows the same steps the senior engineer followed — but shows each step, explains why, and stops before anything destructive ("About to run database migration on production. Approve? [y/n]"). The new hire approves. 12 minutes, 1 person, full trace captured.

Bug report arrives. On-call runs `kloudi run /projects/api/triage`. The agent pulls recent deploys, checks error rates, reads the relevant service's SOP, and presents a hypothesis in 3 minutes. The engineer validates it and starts fixing. No archaeology.

New hire's first PR. The agent already knows the team's conventions (from `/guides/engineering-conventions`) and flags deviations during review — the same ones Sneha would have caught. The new hire learns the patterns by seeing them enforced, not by reading docs.

**The shift:** Knowledge moves from people's heads → SOPs in a filesystem. The agent executes them. Trust comes from visible reasoning + approval gates, not from seniority.

### Named contacts for design partner conversations

- Abhijit Kane — Cofounder, building Postman Agent Mode (adjacent/competitive insight)
- Shamasis — Senior Support Engineer, Postman (support workflow pain)
- Prashant Bhaduria — VP Engineering and Product, Flywl (internal power user)
- Sneh Ganjoo — Staff Product Manager, Flywl (PM persona validation)

### Demand reality (honest)

0/10 external validation. Internal usage of 44 gstack skills validates that executable procedures work. But adoption is LOW even internally — team defaults to human-guarded processes (release manager, DBA, manual testing). The bottleneck is trust, not architecture.

**Why adoption is low (from office hours analysis):**
- Pain is diffuse, not acute. Nobody tracks hours lost to undocumented workflows.
- CLAUDE.md + skill files do 60% of the job for free. The remaining 40% must feel like a category shift (GUI-over-terminal), not an increment.
- Switching cost is the biggest barrier. Teams have working (if fragile) processes.

**What changes adoption:** Trust. Visible reasoning. Approval gates. Run diffs. The moment someone sees the agent stop before a risky action and explain why, they trust it more than the new hire who would have just run the command.

### The assignment

Talk to Abhijit this week. Not to pitch. To understand what they're building, what they see as the gap, and whether they'd be a design partner. Frame: "We have 44 executable SOPs running through Claude Code. We're building the platform layer. What are you seeing?"

---

## HOW — Design

### Interaction model

**Terminal-first.** Primary interaction is a command terminal, not a SaaS dashboard. The filesystem tree provides navigation. Human-in-the-loop prompts appear inline.

From `docs/designs/ui-design-review.md` (scored 2/10 → 6/10):
- Tree (left): folders /guides, /projects, /{custom}
- Terminal (center): command input + streaming execution output
- Entity detail panel: slides in on click (name, level, maturity, graph, metrics, [Run])
- Multi-execution via terminal tabs (● running, ⚠ needs attention, ✔ done)
- NO stat cards. NO card grids. NO hero sections. The tree IS the browser.

### Key design decisions

- v6 mockup exists: `docs/designs/design-preview-v6.html` (dark/light, DM Sans + JetBrains Mono)
- Three spaces: HOME (activity feed + search), BROWSE (Finder-like), EDITOR (procedure detail + graph)
- Agent panel slides in from right
- DESIGN.md exists at repo root — source of truth for visual decisions

<!-- AGENT: run /plan-design-review against this section before implementation -->

---

## HOW — Engineering

### Architecture

TypeScript monorepo. Turborepo + pnpm. Four apps, five packages.

```
apps/api          — Express API server (procedures, executions, filesystem, auth)
apps/web          — Next.js frontend (login, register, entity panel, omnibox, sidebar)
apps/cli          — kloudi CLI (init, ls, run, trace)
apps/mcp-server   — MCP server with tools

packages/core     — Kernel: procedures, execution engine, 4 executors, decisions
packages/auth     — JWT auth with Prisma
packages/infrastructure — AI providers (Claude API), database (Prisma), events, cache
packages/tools    — Builtin tools: filesystem, github, shell, user
packages/shared   — Config (env-only), types, utils, logger
```

### Deployment

| Workload | Platform | URL |
|---|---|---|
| Web (Next.js) | Vercel | `kloudi-os-web` project |
| API (Express) | Render | `https://kloudi-os.onrender.com` |
| Database | Neon (Postgres 17) | `aws-us-east-1` |
| Cache | Upstash Redis | `us-east-1` |
| CLI | npm publish | TBD |

### Build sequence: 3 sprints

Sprint 1 depends on: existing execution engine (shipped), existing Prisma schema, existing API routes.
Sprint 2 depends on: Sprint 1 (working trust gates + traces).
Sprint 3 depends on: Sprint 2 (working CLI + UI + projection).

Each sprint produces a working system. No sprint requires the next to be useful.

### What's already built

- Execution engine with 4 node executors (llm_generate, tool_call, interpolative, sub_entity) — compiles, passes tests
- Prisma schema with Procedure, Execution, ExecutionNode models
- Express API with routes for procedures, executions, filesystem, auth
- Next.js web app with login, register, entity panel, sidebar, omnibox
- CLI scaffold with Commander
- MCP server with tools
- Auth system (JWT, sessions)
- 44 gstack skill files used daily via Claude Code

### What's NOT built

- Trust layer (approval gates — onHumanApprovalNeeded auto-continues, needs real implementation)
- SOP import (parsing SKILL.md into Procedure records)
- SOP projection (generating SKILL.md from Procedure records)
- Onboarding agent
- Organization/Department/UserProfile models (in spec, not in DB)
- Trace analysis or pattern extraction
- AgentFS integration

### Trace format (Sprint 1 deliverable)

The existing `DecisionTrace` type only covers interpolative nodes. For Sprint 1, every node type must produce a structured trace that captures WHY the node did what it did, not just WHAT it output.

**Current schema:** `ExecutionNode.decisionTrace Json?` — flexible JSON field. Keep this. Define the shape per node type:

```
// All node traces share this base
interface NodeTrace {
  nodeType: 'llm_generate' | 'tool_call' | 'interpolative' | 'sub_entity';
  startedAt: string;           // ISO timestamp
  durationMs: number;
  tokensUsed: number;
}

// LLM nodes: what did the model reason about?
interface LLMTrace extends NodeTrace {
  nodeType: 'llm_generate';
  prompt: string;              // the assembled prompt (after variable interpolation)
  model: string;               // which model was used
  response: string;            // full model response
  contextSources: string[];    // which context slots were used (from ContextManager)
}

// Tool call nodes: what tool, what args, what happened?
interface ToolCallTrace extends NodeTrace {
  nodeType: 'tool_call';
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: unknown;
  toolError?: string;
}

// Interpolative nodes: what decision was made and why?
interface InterpolativeTrace extends NodeTrace {
  nodeType: 'interpolative';
  optionsConsidered: string[];
  chosenOption: string;
  reasoning: string;
  confidence?: number;
}

// Sub-entity nodes: which child SOP was called?
interface SubEntityTrace extends NodeTrace {
  nodeType: 'sub_entity';
  childSopId: string;
  childExecutionId: string;
  childStatus: string;
}

// Human approval events (appended to any node's trace)
interface ApprovalEvent {
  requestedAt: string;
  reason: string;              // why the agent stopped
  question: string;            // what was asked
  response: string;            // what the human answered
  respondedAt: string;
  durationMs: number;          // how long the human took to decide
}
```

**Why this matters:** Traces are the raw material for the learning loop. If we don't capture prompt, reasoning, and context sources now, we can never extract patterns later. The "trillion-dollar layer" from chat 01 starts here — not as a world model, but as structured recording of every agent decision.

**What's NOT in Sprint 1 traces:** Intent inference, alternative paths considered, precedent matching, pattern extraction. Those are extraction engine features (deferred). Sprint 1 traces are recording-only.

### Trust layer design (Sprint 1 — #1 blocker)

**The bug (Codex found this):** `onHumanApprovalNeeded` callback in the API route is hardcoded to return `'continue'`. The engine never actually stops for human input.

**Current engine behavior:**
1. Cycle guard (node visited ≥3 times) → calls `onHumanApprovalNeeded` callback → awaits response inline
2. Node returns `waiting_input` status → engine updates DB, pauses → no resume path exists

**The fix is a state machine, not a callback:**

```
STATES:
  running        — engine is executing nodes
  waiting_input  — engine paused, human must respond
  completed      — all nodes done
  failed         — unrecoverable error
  cancelled      — human or system aborted

TRANSITIONS:
  running → waiting_input    (approval gate triggered)
  waiting_input → running    (human approves)
  waiting_input → cancelled  (human rejects)
  running → completed        (terminal node reached)
  running → failed           (unrecoverable error)

APPROVAL TRIGGERS (Sprint 1):
  1. Cycle guard: node visited ≥ threshold times
  2. Node-level: any node with `requiresApproval: true` in graph config
  3. Tool-level: specific tools marked dangerous (shell.exec, github.merge, db.migrate)
```

**Protocol (WebSocket):**

```
// Engine → Client: approval request
{
  type: 'approval_required',
  executionId: string,
  nodeId: string,
  reason: string,           // "Node 'deploy-to-prod' requires approval"
  context: {
    nodeName: string,
    nodeType: string,
    whatWillHappen: string,  // human-readable description of what the node will do
    previousOutput: unknown, // output from the last completed node
  }
}

// Client → API: approval response
POST /api/executions/:id/approve
{
  nodeId: string,
  decision: 'continue' | 'abort',
  comment?: string          // optional human note (captured in trace)
}
```

**Implementation sequence:**
1. Add `requiresApproval` field to graph node config
2. Add dangerous-tool list to engine config
3. When approval triggers: set execution status → `waiting_input`, emit WebSocket message, return from execution loop
4. Add `POST /api/executions/:id/approve` route
5. On approve: set status → `running`, resume execution from paused node
6. On abort: set status → `cancelled`, record in trace
7. Timeout: if no response in 30 minutes, set status → `failed` with timeout reason

**CLI behavior (Sprint 2):** Terminal prompt `[approve/reject]` inline. Same API underneath.

**What's NOT in Sprint 1 trust:** Role-based approval (any authenticated user can approve), multi-approver workflows, auto-approval rules, escalation chains. Those require Organization/Role models (deferred).

---

## Open Questions (Not Yet Ratcheted)

### Product

- [x] Start with solo dev or teams? → RESOLVED: internal-first (Flywl dogfood), external conversations concurrent
- [x] Is there an 8th workflow? → RESOLVED: No. Security is a cross-cutting concern (CSO skill exists as a guide-level SOP, not a separate workflow). Compliance is governance density, not a workflow. 7 is the right number.
- [x] Pattern extraction engine: v1 or v2? → RESOLVED: deferred past Sprint 3. Sprint 1 traces are recording-only. Extraction requires real trace data to design against.
- [ ] Revenue model: marketplace cut? Per-seat? Usage-based? (BLOCKED — needs design partner conversations to inform)

### Architecture

- [x] Will full-fidelity projection work in practice? → PARTIALLY RESOLVED: Sprint 2 proves it for 4 node types (llm_generate, tool_call, interpolative, sub_entity). Complex control flow (loops, parallel) acknowledged as future work. Codex's "canonical AST" concern is valid for .cursorrules but not for SKILL.md (which is markdown, not a formal language).
- [x] Source-of-truth ownership → RESOLVED for v1: SOP in Postgres is canonical. SKILL.md in repos is a projection (read-only view). Edits to SKILL.md are flagged as drift, not auto-merged. Conflict resolution is a v2 problem — v1 is write-from-platform-only.
- [x] AIGNE compatibility → RESOLVED: abandoned. No mention in CEO review or Apr 11-12 session. AgentFS (decision #15) is a reference implementation, not a dependency. Build on Prisma + pluggable storage.
- [x] Context manager → RESOLVED: token budgets + eviction (already built). ContextManager uses 128K budget with reserved slots and priority-based eviction. "Load entire SOP" is impractical for large SOPs.

### Competitive

- [ ] Fabro: stealable patterns (DOT format, model stylesheets, git checkpointing) — worth a research pass before Sprint 2
- [ ] Craft Agents: stealable patterns (skills system, sources abstraction) — worth a research pass before Sprint 2
- [x] "Dark factory" vs "Intelligent VM" framing → RESOLVED: agent-first framing. The agent IS the product.

---

## The Evolution

|Date|What Happened|Key Unlock|
|---|---|---|
|Oct 2025|Universal Copilot Infrastructure|Filesystem is the right abstraction|
|Dec 2025|Context Graphs validation|Decision traces are the system of record|
|Jan 5, 2026|Decision Trace Capture|Capture → Extract → Reuse loop|
|Jan 9|"Everything is SOP" insight|Unified model — one table, one engine|
|Jan 14|Intelligent VM pattern|Interpolative nodes, user-as-tool, harness|
|Jan 26|Rebranded to lore.dev|Marketplace vision, Figma analogy|
|Jan 29|v6 consolidated docs|Single source of truth|
|Mar 2|Governance density|"One slider, not a feature matrix"|
|Mar 18|Fabro comparison|Validated: knowledge OS, not just execution harness|
|Mar 24|ExecutionEngine Phase 1 shipped|Graph traversal, 4 executors, API wiring|
|Apr 11|Office hours + 10-round analysis|Agent-first framing, trust as adoption unlock, 0/10 validation|
|Apr 12|CEO review (Codex outside voice)|3-sprint plan, 16 ratcheted decisions, scope expansion locked|

---

## Alignment Score

|Section|WHY|WHAT|WHO|HOW (Design)|HOW (Eng)|Status|
|---|---|---|---|---|---|---|
|Core insight|✓|✓|✓|—|—|ALMOST: WHO sharpened with JTBD story|
|7 workflows|✓|✓|—|—|✓|LOCKED: mapped to gstack skills, sprint assignment, taxonomy role|
|Everything is SOP|✓|✓|✓|?|✓|ALMOST: PRDs-as-SOPs clarified|
|Filesystem-first|✓|✓|✓|?|✓|ALMOST: 3 defaults locked|
|Governance density|✓|✓|✓|?|?|ALMOST: scaling story defined|
|Trust layer|—|✓|—|—|✓|LOCKED: state machine, WebSocket protocol, approval triggers defined|
|Agent-first|✓|✓|✓|?|?|ALMOST: vision locked, impl pending|
|SOP projection|—|✓|—|—|✓|LOCKED: bidirectional mapping, translation algorithm, exit criterion|
|Agent-agnostic|✓|✓|—|—|✓|ALMOST: projection designed, .cursorrules format TBD|
|First user|✓|✓|✓|—|—|LOCKED: JTBD before/after story, named contacts, adoption blockers|
|Interaction model|—|—|—|✓|—|ALMOST: terminal-first + v6 mockup exists|
|Trace format|—|✓|—|—|✓|LOCKED: per-node-type trace schema, approval events defined|
|Build sequence|—|✓|—|—|✓|LOCKED: 3 sprints defined, exit criteria set|

---

## How to Use This File

1. Start every Claude Code session by reading this file
2. After any decision survives, update this file and commit
3. Reversed decisions go to an appendix, not deleted
4. Open questions that get answered move to ratcheted decisions
5. The ratchet test: does this make the product more aligned on why/what/who/how?

## Key Artifacts

- Office hours design doc: `~/.gstack/projects/nitishMehrotra-kloudi-os/nitish-main-design-20260411-234156.md`
- CEO plan: `~/.gstack/projects/nitishMehrotra-kloudi-os/ceo-plans/2026-04-12-agent-first-os.md`
- Project memory: `~/.claude/projects/-Users-nitish-kloudi-os/memory/project_kloudi_os_model.md`
- Design mockups: `docs/designs/design-preview-v6.html`
- Execution engine spec: `docs/specs/execution-engine-plan.md`
