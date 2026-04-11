# UI Design Review — Terminal-First Model

Generated from /plan-design-review on 2026-03-20
Overall score: 2/10 → 6/10

## Core Decision: Terminal-First

The Canvas prototype (docs/claude-specs/Lore Canvas.jsx) uses a SaaS dashboard model — stat cards, progress bars, card grids. That's generic. The terminal-first model replaces it.

**Primary interaction:** A command terminal where users type commands and watch execution output stream in real-time. The filesystem tree provides navigation. Human-in-the-loop prompts appear inline.

## Layout

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

## Information Architecture

```
PRIMARY SURFACE: Terminal + Filesystem (always visible)
├── Tree (left): folders /guides, /projects, /tasks, /skills
│   L1 view: folders
│   L2 view: entities within folder
├── Terminal (center): command input (bottom), execution output (streaming up)
│   Inline human prompts, decision traces (expandable), errors (red)
│
SECONDARY SURFACES (overlays/panels, not separate pages):
├── Entity Detail Panel: slides in when clicking tree item
│   Shows: name, level, maturity, graph, params, constraints, history, metrics
│   Action: [Run] button
├── Inbox/Notifications: slide-in from right
│   Shows: pending approvals, execution results, pattern detections
├── Omnibox (Cmd+K): everything search + command palette

NAVIGATION: Tab bar at top (like browser tabs)
/guides  /projects  /tasks  /skills  [+]
Each tab = a filesystem directory view

NO SEPARATE PAGES for Dashboard, Store, Settings
These are panels/tabs within the OS, not page navigations
```

## Multi-Execution: Terminal Tabs

Each execution gets its own tab with status badges:
- ● = running
- ⚠ = needs attention (human approval needed)
- ✔ = done

Click tab to switch. Active tab shows streaming output. Inactive tabs show badge if they need attention.

## Interaction State Coverage

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Filesystem tree | Skeleton tree (pulsing lines) | "No procedures yet. Create one." [+ New Procedure] | "Failed to load. Retry." + button | Tree with folders and entities | Folders loaded, some entities err |
| Terminal | Cursor blink (idle) | Welcome: "lore> ready. Try: lore ls" | Red error line with class and what to do | "✔ Complete" + result summary | Nodes 1-2 done, node 3 failed |
| Execution stream | Spinner on current node | "No active executions" | Node failure: red ✖ + message + "Continue? y/n" | All nodes green checkmarks | Some ✔, current ●, future ○ |
| Human approval | N/A | N/A | Timeout: "No response. Aborted" | Choice recorded + execution resumes | N/A |
| Entity detail panel | Skeleton card | "Select a procedure from the tree" | "Failed to load details" | Full entity view with graph + stats | Entity loaded, graph render err |
| Inbox | Skeleton list | "All clear. No pending actions." | N/A | Items with status badges | N/A |
| Omnibox (Cmd+K) | "Searching..." | "No matches for '{query}'" | N/A | Result list | N/A |

## User Journey

| Step | User Does | User Feels | Design Supports |
|---|---|---|---|
| 1 | Opens lore.dev | Curious, maybe intimidated | Terminal with welcome: "lore> ready. Try: lore ls". Tree visible. |
| 2 | Types "lore ls /tasks" | Exploring, safe | Instant response showing list of available tasks |
| 3 | Clicks task in tree | Learning | Detail panel slides in with graph, stats, [Run] |
| 4 | Clicks [Run] or types command | Excited, slightly anxious | Execution stream starts immediately. Node by node. |
| 5 | Watches nodes execute | Engaged, trusting | Real-time streaming. Expand any node to see LLM output + decision trace |
| 6 | Human approval prompt appears | In control, important | Inline prompt, clear context, obvious actions. Not a modal. |
| 7 | Execution completes | Satisfied, productive | Green summary, total time, tokens used. "Run again?" |
| 8 | Returns next day | Returning, informed | Inbox shows what happened. Recent executions. Pattern alerts. |

## AI Slop Risks (avoid these)

- DO NOT use stat cards (Total Runs: 1234). That's dashboard-brain.
- DO NOT use 2-column card grids for procedure browsing. The tree IS the browser.
- DO NOT add a hero section or marketing header.
- Graph visualization should NOT be horizontal arrow chain. Show actual graph topology.

## Deferred Design Decisions

1. Graph visualization library (D3? Custom?)
2. Keyboard shortcuts beyond Cmd+K
3. Terminal history/scrollback behavior
4. Inbox — separate panel or tab?
5. Responsive: terminal = mobile, tree = drawer (functional but not polished)

## Design System (not yet defined)

No DESIGN.md exists. Before implementing frontend, run /design-consultation.
Current defaults: dark theme (zinc scale), Inter font, monospace for terminal (JetBrains Mono or SF Mono), Lucide icons, Tailwind.
