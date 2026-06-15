# Criterio — Vision & Design

> Why this exists, and where it's going. Promoted from a CEO/strategy review on 2026-06-13.

## What it is

A self-hosted, open-source tool that pulls **your slice** of a Jira project — one
Requirement and everything under it — and shows it as a navigable **mindmap**, with the
ability to edit the epics you own, export an LLM-friendly snapshot, and expose an **MCP
server** so an AI can read the hierarchy, verify coverage, and write changes back to real
Jira.

Hierarchy: **Requirement** (external, carries acceptance criteria) → **Epic** (you create
these; have delivery dates) → **Task** (others' work). **Milestones** group epics across
requirements. Target: **Jira Data Center / Server** (REST v2, Personal Access Token).

## The real idea (why this isn't "just a Jira tool")

The prize is **LLM-verified requirement coverage**: given a requirement's acceptance
criteria, prove — with citations — that the implementation work covers each one. That is
**tracker-agnostic**. It works for Jira, Linear, GitHub Issues, Azure DevOps, even a plain
markdown PRD.

**Jira Data Center is the beachhead, not the ceiling.** Atlassian's official MCP is
Cloud-only; self-hosted DC is underserved — that gap is the wedge. The architecture draws a
`TrackerAdapter` seam so the coverage/hierarchy/sync engine never imports Jira directly. The
10x version ("coverage for any tracker") is one adapter away, not a rewrite.

## What makes it different

Existing Jira MCP servers expose Jira's **primitives** (`search_issues`, `get_issue`, JQL),
forcing the LLM to reconstruct the hierarchy and re-derive coverage every call. This project
exposes the **requirement-coverage model itself**: `get_requirement_coverage(KEY)` returns
per-criterion status with epic-key citations. The opinionated model on top of the tracker is
the moat; the mindmap is its beautiful surface.

### Coverage honesty
Acceptance criteria are checklist items inside a requirement, not linkable entities — an epic
links to the *requirement*, not a criterion. So:
- **Pre-LLM:** a deterministic **proxy** (`N criteria · M epics linked`), never a fake `X/N`.
- **Post-LLM:** true `X/N · AI-verified` with per-criterion gaps — cached, with cited
  reasoning, human-confirmed, and **never auto-written back** to the tracker.

## Roadmap shape

- **v1 (this plan):** Jira DC adapter, mindmap, on-demand sync, epic write-back, LLM export,
  MCP with domain tools, Docker. Plus: inline "What's missing?" gap-explainer, coverage-drift
  alerts on re-sync, paste-ready coverage summary, static HTML map snapshot.
- **Next:** Jira Cloud adapter (the official MCP gap is Cloud-OAuth; a second adapter proves
  the seam), then Linear / GitHub Issues.
- **Deferred:** incremental sync, keyboard/screen-reader graph access, responsive layout.

See `DESIGN.md` for the design system and `TODOS.md` for deferred work.
