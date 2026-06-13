# Jira Explorer — Design System

Seeded from the approved mindmap mockup (2026-06-13) via `/plan-design-review`.
Approved reference image: `~/.gstack/projects/jira-explorer/designs/mindmap-canvas-20260613/mindmap-mock.png`
(source HTML alongside it). The React Flow canvas and all UI build to these tokens.

Aesthetic: **calm, data-dense app UI** (Linear / clean graph editor), not a marketing
page. Hierarchy is communicated by **size and weight**, with **one accent color** doing
the work. No gradients-as-decoration, no card mosaics, no system-default fonts.

---

## Tokens

```css
/* Type */
--font-ui:   'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;   /* issue keys, dates */

/* Surfaces */
--bg-app:    #f6f7f9;   --bg-canvas: #f1f3f5;   --bg-panel: #ffffff;   --bg-subtle: #f8f9fb;
--border:    #e4e7eb;   --border-strong: #d3d8de;

/* Ink */
--ink: #1a1d21;  --ink-2: #5b6573;  --ink-3: #8b95a3;

/* Accent (single) */
--accent: #0f766e;  --accent-soft: #d7efe9;       /* teal — NOT purple/indigo */

/* Delivery status (also the legend) */
--over: #dc2626; --over-bg: #fdecec;   /* overdue */
--soon: #b45309; --soon-bg: #fdf3e3;   /* due <= 30 days */
--late: #15803d; --late-bg: #e6f6ec;   /* later */

/* Radii / shadow */
--r-sm: 6px; --r-md: 9px; --r-lg: 13px;
--shadow-card: 0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.04);
--shadow-pop:  0 6px 24px rgba(16,24,40,.10);
```

Canvas background is a 22px dot grid (`radial-gradient` dots in `#dfe3e8`). Body 14px.
Issue keys and dates always render in `--font-mono`. Min body contrast 4.5:1; min body
size 14px (avoid <14 anywhere).

---

## Node design language (the product surface)

Distinction is by **size + weight + kicker label**, never by loud fills.

| Level | Size | Treatment |
|-------|------|-----------|
| **Requirement** (anchor) | 244px, `--r-lg`, 1.5px `--border-strong`, `--shadow-pop` | `REQUIREMENT` kicker + mono key; 15.5px/700 title; **coverage meter** below. Left-most. |
| **Epic** | 216px, `--r-md` | `EPIC` kicker + key; 13.5px/600 title; row of [status pill] [delivery badge] [assignee avatar]; milestone tag clipped to top edge. Selected = 3px `--accent-soft` ring + accent border. |
| **Task** | 168px chip, `--r-sm` | status dot + 12.5px/500 title (truncates) + 18px assignee initial. No badges. |
| **Milestone** | overlay only | A 17px colored pill anchored on member epics + a legend entry. Not a tree node in v1. |

Edges: thin curved connectors, `#c7cdd4` (req→epic) and `#d3d8de` (epic→task), behind nodes.

### Delivery badge (Epics) — req #5
21px badge with calendar glyph + `MMM D`. Color by proximity to due date:
overdue → `over`, within 30 days → `soon`, else → `late`. Inspector shows the same
badge with an explicit "overdue Nd" suffix.

### Coverage meter (Requirements) — the soul on the surface (decisions D5-design / D2-eng)
Two truthful states, because acceptance criteria are checklist items inside a requirement,
NOT linkable Jira entities — an epic links to the *requirement*, never to a criterion. So a
deterministic rule can count, but cannot match criteria 1:1 to epics. Per-criterion truth
needs the LLM.
- **Pre-LLM (deterministic proxy, from P2):** node shows `N criteria · M epics linked` with a
  neutral fill (linked vs not). NEVER a fake `X/N covered` — the proxy never claims per-criterion
  matching it didn't compute.
- **Post-LLM (from P6/P7):** node shows true `X / N covered · AI-verified` with per-criterion
  gaps. The verdict is **cached, shows cited reasoning, and requires human confirm/override**;
  a coverage conclusion is NEVER auto-written back to Jira.
- **No acceptance criteria extractable** (open question O1 fails for that requirement): node shows
  `Coverage unavailable` linking to the Profile's Acceptance-Criteria field config. The
  trust-preserving state — never a fake/zero meter.

---

## Canvas + panel information architecture (decision D3 = A)

Three zones: left **sidebar** (264px), **canvas** (flex), right **inspector** (332px).

Rule so nodes never hide behind panels:
- Sidebar collapses to a **56px icon rail**; inspector is a **right drawer**.
- React Flow `fitView` runs with **padding equal to whatever panel is open**, so the
  selected node/subtree always animates into the clear area on selection.
- Legend + minimap + zoom collapse to a single button when canvas space is tight.
- Deep/wide trees pan/zoom; the **minimap** is the always-available overview.

Top bar (48px): brand mark + name · search · synced-age · Sync · **Export for LLM**.
Sidebar: Connection (status dot + host), Scope (project, label chips), Root requirement
input + "Sync this tree" + counts. Inspector: selected epic — key/type, title, status,
delivery (editable), assignee, milestone, description, **Save to Jira** / Cancel (req #9).

---

## Interaction states (decision D4 = A) — req: empty states are features

Pattern: **canvas-centered** states for full-screen moments (icon + one line of context +
one primary action); **non-blocking inline banner** for partial failures so the existing
tree stays visible.

| Moment | What the user sees |
|--------|--------------------|
| **First run / no connection** | Canvas-centered: "Connect your Jira to begin." Primary: *Connect Jira* (base URL + PAT). Link to PAT docs. |
| **Connected, nothing synced** | Canvas-centered: "Enter a requirement key to map its tree." Primary: focus the Root requirement input. Show recent requirements if any. |
| **Syncing** | Skeleton tree (ghost nodes) + progress with live counts ("Fetched 12 epics, 28/41 tasks…"). Sync button shows a spinner. |
| **Sync error** | Canvas-centered error card naming the cause: bad PAT (401) → "Check your token"; requirement not found (404) → the key, *Edit key*; network → *Retry*. Never a bare spinner. |
| **Partial load** | Tree renders; dismissible banner above it: "3 issues couldn't load." Primary: *Retry failed*. |
| **Empty subtree** | A requirement/epic with no children shows a subtle "No epics yet" / "No tasks yet" affordance on/under the node, not a blank gap. |
| **Coverage unavailable** | Requirement node per D5: "Coverage unavailable — configure Acceptance Criteria field." |
| **Saving an edit** | Inspector "Save to Jira" → inline saving state → success tick or error with the Jira message; optimistic update reconciles on response. |

Every full state: one icon, one sentence, one primary action. Warmth over apology, but
apologize on error ("Couldn't reach Jira").

---

## Accessibility & responsive — tracked, not yet specified

Deferred to TODOs (this was a focused visual+states review). Before 1.0:
- **Keyboard graph nav**: arrow-key move between nodes, Enter to open inspector, Esc to
  close, `/` to focus search. Visible focus ring (reuse the selected-epic accent ring).
- **Screen readers**: the graph needs an accessible list view fallback (tree role) — a
  pure canvas is invisible to AT. Inspector is a labelled region.
- **Contrast/targets**: badges and pills meet 4.5:1; interactive targets ≥ 32px (44px on
  touch).
- **Responsive**: this is a desktop-first tool. Below ~1024px, collapse both panels to
  drawers and let the canvas own the viewport; a true small-screen layout is out of scope
  for v1.

---

## What already exists to reuse
Greenfield. Lean on React Flow's built-in Controls, MiniMap, and Handle styling; style
them to these tokens rather than building from scratch.
