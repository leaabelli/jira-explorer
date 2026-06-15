# Connect Criterio to your LLM

This guide gets an AI assistant talking to Criterio over MCP, so it can read your requirement
trees, run the coverage check, and (optionally) write changes back to Jira. Three steps:
**1) get a token → 2) run the connector → 3) add it to your client.**

---

## 1. Get a Jira Data Center Personal Access Token

In Jira: **Profile → Personal Access Tokens → Create token**. Copy it. (This is a *bearer*
credential to your real Jira — treat it like a password.)

You'll also want your Jira base URL, e.g. `https://jira.your-company.com`.

## 2. Run the connector

Pick **one** transport.

### Option A — HTTP (one process serves everything)

```bash
cp .env.example .env        # set JIRA_BASE_URL + JIRA_PAT (or configure projects in the UI later)
npm install
npm run serve               # web UI + REST API + MCP, all on http://localhost:3000
```

The MCP endpoint is `http://localhost:3000/mcp`. (Docker: `docker compose up --build` does the same.)

### Option B — stdio (local, no server)

For clients that launch the connector themselves (Claude Desktop / Claude Code):

```bash
npm install
JIRA_BASE_URL=https://jira.your-company.com JIRA_PAT=xxxxx npm run mcp:stdio
```

> **Tip:** create your projects in the web UI first (`npm run serve` → ⚙). Each project has its own
> connection + cache; the MCP tools take an optional `projectId` and default to the first project.

## 3. Add it to your client

### Claude Code (CLI)

HTTP (recommended — same cache as the UI):
```bash
claude mcp add --transport http criterio http://localhost:3000/mcp
```

or stdio (Claude Code launches it; substitute the absolute path):
```bash
claude mcp add criterio \
  --env JIRA_BASE_URL=https://jira.your-company.com \
  --env JIRA_PAT=xxxxx \
  -- npx tsx /ABSOLUTE/PATH/TO/criterio/packages/app/src/mcp/stdio.ts
```
Verify with `claude mcp list`. (Run `claude mcp add --help` if flags differ in your version.)

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):
```json
{
  "mcpServers": {
    "criterio": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/criterio/packages/app/src/mcp/stdio.ts"],
      "env": {
        "JIRA_BASE_URL": "https://jira.your-company.com",
        "JIRA_PAT": "your-personal-access-token",
        "DATA_DIR": "/ABSOLUTE/PATH/TO/criterio/data",
        "MCP_ALLOW_WRITE": "true",
        "MCP_APPLY_TO_JIRA": "false"
      }
    }
  }
}
```
Restart Claude Desktop; the tools appear under the 🔌 menu.

### Cursor / other HTTP MCP clients

Point the client at the HTTP endpoint:
```json
{ "mcpServers": { "criterio": { "url": "http://localhost:3000/mcp" } } }
```

---

## 4. Try it

Ask your assistant:

> "List my Criterio projects, sync requirement **PLAT-1042**, then check whether its epics
> cover every acceptance criterion and cite the epics."

Under the hood it calls `list_projects` → `sync` → `get_requirement_coverage`, then reasons over the
returned context pack and reports `covered: X/N` with the gaps.

## Safety

| env | default | effect |
|---|---|---|
| `MCP_ALLOW_WRITE` | `true` | `false` = read-only connector (all write tools refuse). |
| `MCP_APPLY_TO_JIRA` | `false` | default for `update_epic`: cache-only dry run unless the call passes `applyToJira: true`. |

The assistant never auto-writes a coverage conclusion — only concrete field edits you ask for.
Full tool reference: **[docs/mcp.md](mcp.md)**.
