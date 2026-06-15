# Criterio MCP Server

The MCP (Model Context Protocol) server exposes the **requirement-coverage model** to an LLM —
not raw Jira CRUD. An assistant can read your requirement tree, **verify whether your epics cover
each acceptance criterion** (with citations), and optionally write changes back to real Jira.

Every tool wraps the same engine the web UI uses, so an LLM's reads/writes behave **identically**
to the UI's.

## Projects

The tool serves multiple **projects** (saved Jira explorations, each with its own connection,
scope, profile, and cache). Every tool takes an optional `projectId` (from `list_projects`) and
**defaults to the first project**. On first run a `Default` project is seeded from
`JIRA_BASE_URL`/`JIRA_PAT` if set.

- `list_projects` — `[ { "id": "...", "name": "Default", "baseUrl": "...", "lastSyncedAt": "..." } ]`

---

## Two ways to run it

### 1. Stdio (local LLM clients — Claude Desktop, Claude Code)

```bash
JIRA_BASE_URL=https://jira.your-company.com JIRA_PAT=xxxxx npm run mcp:stdio
```

Logs go to **stderr**; **stdout** carries the protocol. Configure your client to launch it. Example
Claude Desktop entry (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "criterio": {
      "command": "npx",
      "args": ["tsx", "packages/app/src/mcp/stdio.ts"],
      "cwd": "/absolute/path/to/criterio",
      "env": {
        "JIRA_BASE_URL": "https://jira.your-company.com",
        "JIRA_PAT": "your-personal-access-token",
        "DATA_DIR": "/absolute/path/to/criterio/data",
        "MCP_ALLOW_WRITE": "true",
        "MCP_APPLY_TO_JIRA": "false"
      }
    }
  }
}
```

### 2. Streamable HTTP (remote LLMs / agents)

The web server mounts MCP at `POST /mcp` (stateless). Point a Streamable-HTTP MCP client at
`http://localhost:3000/mcp`. The HTTP and stdio servers share the same cache and engine.

---

## Safety switches

| env var | default | effect |
|---|---|---|
| `MCP_ALLOW_WRITE` | `true` | When `false`, all write tools refuse and return an error. Read-only server. |
| `MCP_APPLY_TO_JIRA` | `false` | Default for `update_epic`'s `applyToJira`. When `false`, epic edits update only the **local cache** (a dry run) unless the call passes `applyToJira: true`. |

**The coverage verdict is never auto-written.** `update_epic` only changes the concrete fields you
pass. An assistant must not turn a coverage conclusion into a write without explicit user intent.

---

## Tools

### Reads (`readOnlyHint: true`)

#### `list_requirements`
List requirement keys synced into the local cache, with last sync time. Start here.
- **input:** none
- **example result:** `[{ "rootKey": "PLAT-1042", "syncedAt": "2026-06-13T22:19:24Z" }]`

#### `get_hierarchy`
Full requirement tree (requirement → epics → tasks, milestones, coverage proxy) as JSON.
- **input:** `{ "rootKey": "PLAT-1042" }`
- **result:** JSON `{ root, milestones, issuesByKey }`. If not synced: an error telling you to `sync` first.

#### `get_issue`
A single cached issue by key.
- **input:** `{ "key": "PLAT-1190" }`

#### `get_requirement_coverage`  ← the coverage check
An **LLM-ready context pack**: the requirement's acceptance criteria, every linked epic (status,
delivery date, description) and its tasks, plus an explicit instruction to map each criterion to an
epic and flag gaps.
- **input:** `{ "rootKey": "PLAT-1042" }`
- **result (excerpt):**
  ```
  # Requirement PLAT-1042: Checkout supports saved payment methods
  ## Acceptance Criteria
  - [AC-1] Saved cards are tokenized
  - [AC-3] Refund within 30 days
  ## Epics
  ### PLAT-1190: Tokenized card vault (status: In Progress · delivery: 2026-08-29)
  ## Coverage check (for the reviewing LLM)
  For EACH acceptance criterion ... cite the epic key(s) ... Conclude with `covered: X/N`.
  ```
- The deterministic proxy (criteria count + linked-epic count) is included but is **not** a
  per-criterion verdict — producing that verdict from the text is the LLM's job.

#### `get_export`
Export the tree as markdown (`md`) or JSON (`json`).
- **input:** `{ "rootKey": "PLAT-1042", "format": "md" }`

#### `get_profile`
The active Profile (how Requirement/Epic/Task/Milestone map onto this Jira instance).
- **input:** none

### Writes (gated by `MCP_ALLOW_WRITE`)

#### `sync`  (`readOnlyHint: false`)
Fetch a requirement + its whole tree from Jira into the cache, replacing the prior sync.
- **input:** `{ "rootKey": "PLAT-1042" }`
- **result:** `{ "issueCount": 54, "epicCount": 12, "taskCount": 41, "milestoneCount": 1, ... }`

#### `update_epic`  (`readOnlyHint: false`, `destructiveHint: false`)
Update editable epic fields. **Cache-only by default** (dry run); pass `applyToJira: true` to write
to real Jira.
- **input:** `{ "key": "PLAT-1190", "deliveryDate": "2026-07-30", "applyToJira": true }`
- **result:** `Updated PLAT-1190 in Jira and cache.` (or `... in the local cache only (dry run; ...)`).

#### `transition_issue`  (`readOnlyHint: false`)
Move an issue through a named workflow transition. Always writes to real Jira.
- **input:** `{ "key": "PLAT-1191", "transitionName": "Done" }`

---

## A typical coverage session

1. `sync({ rootKey: "PLAT-1042" })` — pull the tree.
2. `get_requirement_coverage({ rootKey: "PLAT-1042" })` — get the pack.
3. The LLM maps each `AC-n` to epic(s) and reports `covered: 4/5`, gap = `AC-3`.
4. (optional) `update_epic({ key: "PLAT-1190", deliveryDate: "...", applyToJira: true })` — only a
   concrete field edit the user asked for, never the coverage conclusion itself.
