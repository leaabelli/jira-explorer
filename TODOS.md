# TODOS

## Design debt (deferred from /plan-design-review 2026-06-13)

These were consciously deferred so the focused review could nail the mindmap visual and
interaction states first. Pick up before a 1.0 / wider OSS release.

### T-A11Y — Keyboard + screen-reader access for the graph ✅ done
- Arrow-key navigation between nodes (focusable canvas + visible focus ring), Escape to
  deselect, and a **role=tree List view** fallback so screen readers can traverse. Pure
  navigation logic is unit-tested (`mindmap/navigation.ts`).
- Remaining polish (smaller follow-up): `/` to focus the root input, roving-tabindex inside
  the tree, and announcing selection changes via an aria-live region.

### T-PROFILE-EDITOR — Structured visual profile editor ✅ done
- **What:** The project settings panel edits the Profile as raw JSON (advanced). Add a structured
  editor: per-level issue types, parent-link kind (epic-link / issue-link + type + direction),
  the acceptance-criteria source (the O1 knob) as a dropdown, and the Epic-Link field id.
- **Why:** JSON is fine for power users but intimidating for everyday config; the AC source is the
  load-bearing setting and deserves a guided control.
- **Pros:** Lower-friction config; fewer malformed-profile errors.
- **Cons:** A fair amount of form UI; the JSON editor already works.
- **Context:** Connection + scope are already structured; only the Profile is JSON. See
  `web/src/components/ProjectSettings.tsx` and `docs/sample-profile.json`.
- **Depends on:** multi-project config UI (done).

### T-INCREMENTAL-SYNC — Incremental refresh by `updated` ✅ done
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

### T-RESPONSIVE — Small-screen layout ✅ done
- Below `lg` (1024px): sidebar and inspector collapse to fixed drawers (hamburger + backdrop +
  close); the canvas takes the full viewport. Verified at 760px.
