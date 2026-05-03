# Design System — kloudi

## Product Context

- **What this is:** The Machine — an always-on organizational intelligence for software teams. SOPs encode how the org works. The Machine watches tools (GitHub, Jira, Slack), initiates when something needs attention, and executes through trusted operatives. Not a chatbot, not a script runner.
- **Who it's for:** Engineers (CLI primary, Root trust), PMs and managers (web feed, Finch trust), and any department that has processes and produces work.
- **Space/industry:** Developer tools / organizational OS. Peers: Linear, Notion, Cursor, Claude Code, n8n.
- **Project type:** Three-panel OS — nav rail (56px) + center canvas (one app, full bleed) + right terminal panel (320px wterm). Same experience as CLI, different surface.
- **Positioning:** Tesla, not car. Airbnb, not Expedia. A new kind of tool, not an old one retrofitted.

## Design Philosophy

- **Terminal-to-OS trajectory:** Starts with terminal DNA (monospace, dense, command-driven), evolves into a full OS with app marketplace, workspaces, and rich UI. The design system supports both ends of this spectrum.
- **Content-first, chrome-last:** No window decorations, no unnecessary borders, no visual noise. Content earns its pixels. Everything else disappears.
- **Spaces, not windows:** Users move between spaces (Home, Browse, Editor, Store), not manage windows. Context flows; the user never "opens an app."
- **Inspiration:** MercuryOS (fluid contextual surfaces), Linear (polish + density), Cursor (editor DNA), Claude Code (terminal maturity), Notion (approachable workspace).

## Architecture — Three-Panel OS

```
┌────────┬──────────────────────────────────┬──────────────────┐
│        │                                  │                  │
│  NAV   │     CENTER CANVAS                │  RIGHT PANEL     │
│  56px  │                                  │  320px           │
│        │  One app at a time.              │  (resizable)     │
│  Icon  │  Full bleed. Instant switch.     │                  │
│  only  │                                  │  wterm           │
│        │  Apps:                           │  (embedded       │
│  ●     │    Home / Feed                   │   terminal)      │
│  ○     │    Browse (SOP filesystem)       │                  │
│  ○     │    Editor (markdown + map view)  │  Machine speaks  │
│  ○     │    Analytics                     │  first. Human    │
│  ○     │    Settings                      │  converses.      │
│  ○     │    Store (marketplace)           │                  │
│        │                                  │  ⌘. to toggle    │
└────────┴──────────────────────────────────┴──────────────────┘
```

**Key principle:** The Machine initiates through Feed. Humans reach The Machine through the right-panel terminal (wterm) or CLI. The center canvas is read-only observation for PMs; active workspace for engineers via wterm.

### Navigation

- **Nav rail** (left, 56px): Icon-only. Active app: accent background. Reorderable. Theme toggle + avatar at bottom.
- **Center canvas** transitions instantly — iPad model. No tabs, no windows. One app fills the space.
- **Right panel** (320px): wterm connected to the agent loop via WebSocket. Same experience as standalone `kloudi` CLI, just embedded. Collapsible (⌘.). Resizable.
- **⌘K** opens command palette from anywhere.

### Mobile

- Nav rail collapses; bottom tab bar replaces it.
- Agent panel becomes full-screen overlay.
- Browse grid adapts (3 columns → 2 on phone).
- Same codebase, responsive — not a separate mobile app.

## Aesthetic Direction

- **Direction:** Industrial/Utilitarian with editorial maturity
- **Decoration level:** Minimal — typography, spacing, and surface color do the work. No gradients, blobs, or decorative elements.
- **Mood:** Calm, confident, precise. The tool disappears; the work is front and center. A senior engineer's IDE meets a designer's sense of polish. Feels inevitable, not designed.
- **Border radius:** Subtle and hierarchical — not uniform bubbly corners.
  - Containers/panels: 0px (sharp — industrial signal)
  - Cards/interactive surfaces: 8px
  - Buttons/inputs: 4-6px
  - Badges/pills: 12px (fully rounded)
  - Avatars: 50% (circle)

## Typography

- **Display/Hero:** DM Sans 700 — geometric, modern, high readability at large sizes
- **Body:** DM Sans 400/500 — same family, consistent, excellent at 14px
- **UI/Labels:** DM Sans 500
- **Data/Tables/System:** JetBrains Mono 400/500 — the terminal DNA. Used for execution IDs, node types, timestamps, durations, token counts, mono data, terminal output. First-class citizen, not afterthought.
- **Code:** JetBrains Mono 400
- **Loading:** Google Fonts CDN (`DM+Sans`, `JetBrains+Mono`)
- **Scale:**
  ```
  10px  — mono labels, timestamps, metadata
  11px  — small badges, secondary mono
  12px  — terminal output, feed metadata, small body
  13px  — body text (compact surfaces), card titles
  14px  — primary body text (base)
  15px  — editor body text (reading surfaces)
  18px  — section headings
  22px  — page titles
  28px  — display / hero greetings
  ```
- **Rule:** Sans-serif (DM Sans) = human/editorial content. Monospace (JetBrains Mono) = machine/system data. This split reinforces the terminal-to-OS trajectory.

## Color

### Approach: Restrained

Color is rare and meaningful. The interface is mostly neutral; color signals status, action, or attention.

### Dark Theme (default)

```css
--bg-0: #0a0b0e; /* deepest — terminal surfaces */
--bg-1: #101114; /* base — primary background */
--bg-2: #161719; /* surface — cards, panels */
--bg-3: #1c1d21; /* elevated — popovers, dropdowns */
--bg-4: #242529; /* hover states */
--bg-5: #2e3035; /* active states, strong hover */

--text-1: #f0f1f4; /* primary text — headings, body */
--text-2: #a0a4b4; /* secondary — descriptions, metadata */
--text-3: #636678; /* muted — placeholders, inactive */
--text-4: #3e4050; /* disabled, decorative */

--accent: #636bff; /* indigo — interactive/active states ONLY */
--accent-s: rgba(99, 107, 255, 0.12); /* subtle accent background */
--accent-h: #7b82ff; /* accent hover */

--green: #36d89a; /* success, completed */
--green-s: rgba(54, 216, 154, 0.12);
--amber: #e8a63e; /* warning, waiting */
--amber-s: rgba(232, 166, 62, 0.12);
--red: #e85b5b; /* error, failed */
--red-s: rgba(232, 91, 91, 0.12);
--blue: #4fa0e8; /* info, running */
--blue-s: rgba(79, 160, 232, 0.12);

--border: #1e2024; /* default border */
```

### Light Theme

```css
--bg-0: #f5f6f8; /* deepest — page background */
--bg-1: #ffffff; /* base — primary surfaces */
--bg-2: #f0f1f4; /* surface — cards */
--bg-3: #e8e9ee; /* elevated */
--bg-4: #dfe0e6; /* hover */
--bg-5: #d3d5dc; /* active */

--text-1: #131520; /* primary */
--text-2: #5c5f70; /* secondary */
--text-3: #9a9dac; /* muted */
--text-4: #c4c6d0; /* disabled */

--accent: #4a52e0;
--accent-s: rgba(74, 82, 224, 0.08);
--accent-h: #5b63f0;

--green: #1a9960;
--green-s: rgba(26, 153, 96, 0.08);
--amber: #c48a1a;
--amber-s: rgba(196, 138, 26, 0.08);
--red: #c93d3d;
--red-s: rgba(201, 61, 61, 0.08);
--blue: #2b7cc9;
--blue-s: rgba(43, 124, 201, 0.08);

--border: #e4e5ea;
```

### Auto Theme

Respects `prefers-color-scheme`. User can override to light/dark/auto.

### Color Rules

1. **Accent is for interactive states only.** Active nav item, focused input, primary button, keyboard shortcut highlight. Never as decoration or background fill.
2. **Semantic colors signal status.** Green = success/completed. Red = error/failed. Amber = warning/waiting. Blue = info/running. No other meanings.
3. **Subtle variants (`-s`) for backgrounds.** Badge backgrounds, alert backgrounds, hover states on status items. Full-saturation colors only for dots, icons, and small indicators.

## Spacing

- **Base unit:** 4px
- **Density:** Compact — closer to Linear/VS Code than Notion
- **Scale:**
  ```
  2xs:  2px    — hairline gaps
  xs:   4px    — tight element spacing
  sm:   8px    — inside cards, between related items
  md:   12px   — padding, between sections within a card
  lg:   16px   — between cards, section padding
  xl:   24px   — major section gaps
  2xl:  32px   — page section breaks
  3xl:  48px   — hero/greeting top padding
  ```

## Layout

- **Approach:** Space-based, not window-based. Each space fills the viewport minus the nav rail.
- **Nav rail:** 56px fixed left, icon-only. Collapses on mobile.
- **Agent panel:** 320px right-side slide-in, togglable. Collapses on mobile.
- **Max content width:** 640px for feed/text-heavy content (Home). Full-width for Browse and Editor.
- **Grid:**
  - Browse: `repeat(auto-fill, minmax(130px, 1fr))`
  - Store: `repeat(auto-fill, minmax(260px, 1fr))`
  - Stats: 4-column grid, collapses to 2 on mobile
  - Quick access: horizontal scroll row

## Motion

- **Approach:** Minimal-functional — only transitions that aid spatial comprehension
- **Easing:**
  - Enter: `ease-out` (elements arriving)
  - Exit: `ease-in` (elements leaving)
  - Move: `ease-in-out` (repositioning)
- **Duration:**
  - Micro: 100ms (hover states, toggles)
  - Short: 150ms (panel slide, nav transitions)
  - Medium: 200ms (space transitions, card reveals)
- **Rules:**
  - No bouncing, no spring physics, no entrance animations on page load
  - No animation on status badge transitions (instant swap)
  - Agent panel slide: 200ms ease-out
  - Hover lift on cards: `translateY(-2px)` with 150ms
  - Live execution pulse: 2s infinite on green dot

## Components

### Status Badges

Pill-shaped (border-radius: 12px), monospace, semantic color background with matching text:

```
● completed  — green-s bg, green text
● failed     — red-s bg, red text
● running    — blue-s bg, blue text
● waiting    — amber-s bg, amber text
● pending    — bg-4, text-3
● cancelled  — accent-s bg, accent text
● edited     — bg-4, text-3
```

### Buttons

- **Primary:** Accent background, white text, 4px radius. Hover lifts slightly.
- **Secondary:** Transparent, border, text-2. Hover fills bg-3.
- **Danger:** Red background, white text.
- **Ghost:** No background, no border, text-3. Hover → text-2.

### Cards

- Background: bg-1 (one step above base)
- Border: 1px solid border
- Radius: 8px (not sharp like containers)
- Hover: border darkens, translateY(-2px), subtle shadow
- Used for: quick access items, feed posts, store apps, node execution cards

### Inputs

- Background: bg-2
- Border: 1px solid border
- Radius: 6-8px
- Focus: accent border + 3px accent-s box-shadow
- Placeholder: text-4

### Progress Bars

- Height: 2-3px
- Background: bg-3
- Fill colors match semantic status (green/blue/red/amber)
- Border-radius: 1-2px

### Avatars

- Size: 28-30px
- Border-radius: 50%
- Background: bg-4
- Text: 11-12px, font-weight 600, text-2

## Feed / Activity Stream

The Home space's primary surface. Social-media-style posts showing team activity:

### Post Types

1. **Execution run** — avatar, user, "ran a SOP", timestamp. Card with SOP name, status badge, node-by-node progress dots, progress bar.
2. **Execution completed** — same structure, green status, full progress bar.
3. **Execution failed** — red border on card, error context in metadata.
4. **Awaiting approval** — amber border, approval question block with Continue/Abort buttons inline.
5. **SOP edited** — "edited" badge, description of change.

### Post Interactions

- Reactions: emoji + count (👀 2, ✅ 1)
- Reply: opens thread
- Retry: on failed posts, triggers re-run
- Clicking the card navigates to Editor space for that SOP

## Accessibility

- **Keyboard navigation:** All spaces navigable via keyboard. Tab through nav rail, cards, buttons. Enter to activate.
- **Focus indicators:** Accent border + accent-s box-shadow (same as input focus).
- **Touch targets:** Minimum 44px on mobile, 36px on desktop.
- **Color contrast:** All text-1 on bg-1 exceeds WCAG AA. Semantic colors chosen for sufficient contrast on both light and dark themes.
- **Screen readers:** ARIA landmarks for nav rail, main content, agent panel. Semantic HTML (nav, main, aside).
- **Reduced motion:** Respect `prefers-reduced-motion` — disable all transitions.

## Anti-Patterns (never do these)

1. Purple/violet gradients as default accent
2. 3-column feature grid with icons in colored circles
3. Centered everything with uniform spacing
4. Uniform bubbly border-radius on all elements
5. Gradient buttons as primary CTA
6. Decorative blobs, floating circles, wavy dividers
7. Generic hero copy ("Welcome to...", "Unlock the power of...")
8. Window decorations (title bars, traffic lights) in the web UI
9. Dock/taskbar as primary navigation
10. "App within an app" windowing — spaces flow, they don't stack

## Decisions Log

| Date       | Decision                                | Rationale                                                                                                  |
| ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 2026-03-25 | Initial design system created           | Created by /design-consultation based on product context — OS for EPD teams with terminal-to-OS trajectory |
| 2026-03-25 | Spaces over windows (v5→v6)             | MercuryOS-inspired. Windows feel like old OS retrofitted. Spaces feel native to the web.                   |
| 2026-03-25 | DM Sans + JetBrains Mono                | DM Sans: geometric, modern, readable at 14px. JetBrains Mono: terminal DNA, first-class system font.       |
| 2026-03-25 | Activity feed on Home                   | Merged social feed with home — team sees SOP runs as posts with progress, approvals, reactions.            |
| 2026-03-25 | Store as a Space                        | Marketplace for apps/integrations. Categories: Workspace, Agent, Analytics, Integrations.                  |
| 2026-03-25 | Restrained color approach               | Color is rare and meaningful. Accent only for interactive states. Neutral everything else.                 |
| 2026-03-25 | Sharp containers, rounded cards         | Industrial signal on structural elements. Friendly radius on interactive cards.                            |
| 2026-03-25 | Mobile via responsive, not separate app | Same codebase. Nav rail → bottom tabs. Agent panel → full-screen overlay.                                  |
