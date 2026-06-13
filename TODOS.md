# TODOS

## Design debt (deferred from /plan-design-review 2026-06-13)

These were consciously deferred so the focused review could nail the mindmap visual and
interaction states first. Pick up before a 1.0 / wider OSS release.

### T-A11Y — Keyboard + screen-reader access for the graph
- **What:** Arrow-key navigation between nodes, Enter to open the inspector, Esc to close,
  `/` to focus search, a visible focus ring (reuse the selected-epic accent ring), and an
  accessible **list/tree view fallback** so screen readers can traverse the hierarchy (a
  pure canvas is invisible to assistive tech).
- **Why:** A node-graph is the whole product; without this it's unusable for keyboard and
  screen-reader users, and it blocks any accessibility-conscious OSS adopter.
- **Pros:** Real inclusivity; also makes power-user navigation faster.
- **Cons:** Non-trivial — React Flow keyboard handling + a parallel semantic tree view.
- **Context:** Design system has the visual ring + tokens; the gap is interaction + an AT
  fallback. See `DESIGN.md` → "Accessibility & responsive".
- **Depends on:** P4 (mindmap) exists.

### T-INCREMENTAL-SYNC — Incremental refresh by `updated`
- **What:** Replace full re-sync with an incremental path: track last-sync time, refresh via JQL
  `updated >= lastSync`, upsert only changes, and correctly reconcile deletions / scope changes /
  re-parenting.
- **Why:** Full re-sync is correct and fast for scoped trees, but re-fetches unchanged issues; on
  very large trees this is wasteful network.
- **Pros:** Fewer API calls / less data on refresh.
- **Cons:** Must handle deletes, moves, re-parents or the cache goes stale — the bug class we
  deliberately avoided in v1.
- **Context:** Eng review D5 chose full re-sync for v1. Only pursue if sync feels slow in practice.
- **Depends on:** P2 sync engine exists.

### T-RESPONSIVE — Small-screen layout
- **What:** Below ~1024px, collapse both panels to drawers and give the canvas the full
  viewport; define a genuine tablet/mobile layout rather than "stacked."
- **Why:** Desktop-first is fine for v1, but a broken small-screen experience erodes trust
  for anyone who opens it on a laptop split-screen or tablet.
- **Pros:** Usable on more devices; better first impression.
- **Cons:** Graph canvases are awkward on small touch screens; real effort.
- **Context:** v1 is explicitly desktop-first (`DESIGN.md`). This is the follow-up.
- **Depends on:** P4 (mindmap) exists.
