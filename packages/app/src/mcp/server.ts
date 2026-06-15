/*
 * Copyright (C) 2026 Leandro Belli <leaabelli@gmail.com>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppConfig } from '../config';
import type { ExplorerService } from '../services';
import type { Workspace } from '../workspace';

// The MCP server exposes the requirement-coverage MODEL to an LLM (not raw Jira CRUD): the soul.
// Every tool resolves a per-project ExplorerService (the SAME engine the UI uses). projectId is
// optional and defaults to the first project. Writes are gated by MCP_ALLOW_WRITE; epic edits
// honor applyToJira (cache-only vs real Jira). See docs/mcp.md.

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const err = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });
const json = (v: unknown) => JSON.stringify(v, null, 2);

export function buildMcpServer(workspace: Workspace, config: AppConfig): McpServer {
  const server = new McpServer({ name: 'criterio', version: '0.1.0' });
  const writesAllowed = config.mcp.allowWrite;

  /** Resolve a project's service (defaults to the first project). */
  const resolve = (projectId?: string): ExplorerService | { error: string } => {
    const id = projectId ?? workspace.defaultProjectId();
    if (!id) return { error: 'No project configured. Create one in the UI first.' };
    const s = workspace.getService(id);
    return s ?? { error: `Project "${id}" not found. Call list_projects to see ids.` };
  };
  const projectId = z
    .string()
    .optional()
    .describe('Project id (from list_projects). Defaults to the first project.');

  // ── reads ──────────────────────────────────────────────────────────────────
  server.registerTool(
    'list_projects',
    {
      description: 'List the configured projects (saved Jira explorations) with their ids and names. Use a project id with the other tools to target a specific exploration.',
      inputSchema: {},
      annotations: { readOnlyHint: true, title: 'List projects' },
    },
    async () =>
      ok(json(workspace.store.list().map((p) => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, lastSyncedAt: p.lastSyncedAt })))),
  );

  server.registerTool(
    'list_requirements',
    {
      description: 'List the requirement keys synced into a project, with last sync time. Start here.',
      inputSchema: { projectId },
      annotations: { readOnlyHint: true, title: 'List synced requirements' },
    },
    async ({ projectId: pid }) => {
      const s = resolve(pid);
      return 'error' in s ? err(s.error) : ok(json(s.listRoots()));
    },
  );

  server.registerTool(
    'get_hierarchy',
    {
      description: 'Return the full requirement tree (requirement → epics → tasks, milestones, coverage proxy) as JSON from a project cache. Call sync first if stale.',
      inputSchema: { rootKey: z.string().describe('The requirement issue key, e.g. "PLAT-1042".'), projectId },
      annotations: { readOnlyHint: true, title: 'Get requirement hierarchy' },
    },
    async ({ rootKey, projectId: pid }) => {
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      const h = s.getHierarchy(rootKey);
      return h ? ok(json(h)) : err(`No cached hierarchy for ${rootKey}. Run sync("${rootKey}") first.`);
    },
  );

  server.registerTool(
    'get_issue',
    {
      description: 'Return a single cached issue (requirement, epic, or task) by key.',
      inputSchema: { key: z.string().describe('The issue key, e.g. "PLAT-1190".'), projectId },
      annotations: { readOnlyHint: true, title: 'Get issue' },
    },
    async ({ key, projectId: pid }) => {
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      const i = s.getIssue(key);
      return i ? ok(json(i)) : err(`Issue ${key} not in cache.`);
    },
  );

  server.registerTool(
    'get_requirement_coverage',
    {
      description:
        'THE COVERAGE CHECK. Returns an LLM-ready context pack for a requirement: its acceptance criteria, every linked epic (status, delivery, description) and tasks, plus an instruction to verify which epic implements each criterion. Use this to answer "is requirement X fully covered?" and cite epic keys. The deterministic proxy is included but is NOT a per-criterion verdict — that is your job from the text.',
      inputSchema: { rootKey: z.string().describe('The requirement issue key to check.'), projectId },
      annotations: { readOnlyHint: true, title: 'Get requirement coverage pack' },
    },
    async ({ rootKey, projectId: pid }) => {
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      const pack = s.exportContext(rootKey, 'md');
      return pack ? ok(pack.body) : err(`No cached hierarchy for ${rootKey}. Run sync("${rootKey}") first.`);
    },
  );

  server.registerTool(
    'get_export',
    {
      description: 'Export the requirement tree as an LLM markdown context pack ("md") or machine JSON ("json").',
      inputSchema: {
        rootKey: z.string().describe('The requirement issue key.'),
        format: z.enum(['md', 'json']).default('md').describe('"md" (default) or "json".'),
        projectId,
      },
      annotations: { readOnlyHint: true, title: 'Export requirement tree' },
    },
    async ({ rootKey, format, projectId: pid }) => {
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      const out = s.exportContext(rootKey, format);
      return out ? ok(out.body) : err(`No cached hierarchy for ${rootKey}.`);
    },
  );

  server.registerTool(
    'get_profile',
    {
      description: "Return a project's active Profile: how Requirement/Epic/Task/Milestone map onto its Jira (issue types, link types, field ids, where acceptance criteria live).",
      inputSchema: { projectId },
      annotations: { readOnlyHint: true, title: 'Get profile' },
    },
    async ({ projectId: pid }) => {
      const s = resolve(pid);
      return 'error' in s ? err(s.error) : ok(json(s.getProfile()));
    },
  );

  // ── writes (gated) ─────────────────────────────────────────────────────────
  const denied = () =>
    writesAllowed ? null : err('Writes are disabled on this server (set MCP_ALLOW_WRITE=true to enable).');

  server.registerTool(
    'sync',
    {
      description: 'Fetch a requirement and its whole tree from Jira into a project cache, replacing the prior sync. Required before reads if never synced. Pass incremental=true to only refresh changed issues’ fields (faster; does NOT pick up new/deleted/moved issues).',
      inputSchema: {
        rootKey: z.string().describe('The requirement issue key to sync.'),
        incremental: z.boolean().optional().describe('If true, only refresh changed issues’ fields (requires a prior full sync).'),
        projectId,
      },
      annotations: { readOnlyHint: false, title: 'Sync from Jira' },
    },
    async ({ rootKey, incremental, projectId: pid }) => {
      const blocked = denied();
      if (blocked) return blocked;
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      try {
        const result = await s.sync(rootKey, { incremental });
        workspace.store.setLastSynced(s.project.id, result.syncedAt);
        return ok(json(result));
      } catch (e) {
        return err(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'update_epic',
    {
      description: 'Update editable epic fields (summary, description, delivery date, labels). Cache-only by default (dry run); pass applyToJira=true to also write to real Jira. NEVER auto-apply a coverage conclusion — only concrete field edits the user asked for.',
      inputSchema: {
        key: z.string().describe('The epic issue key, e.g. "PLAT-1190".'),
        summary: z.string().optional().describe('New summary/title.'),
        description: z.string().optional().describe('New description (Jira wiki markup).'),
        deliveryDate: z.string().optional().describe('New delivery date as YYYY-MM-DD.'),
        labels: z.array(z.string()).optional().describe('Replacement labels array.'),
        applyToJira: z.boolean().optional().describe('If true, write to real Jira; else update only the local cache (dry run).'),
        projectId,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, title: 'Update epic' },
    },
    async ({ key, applyToJira, projectId: pid, ...patch }) => {
      const blocked = denied();
      if (blocked) return blocked;
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      const apply = applyToJira ?? config.mcp.applyToJira;
      try {
        await s.updateEpic(key, patch, apply);
        return ok(`Updated ${key} ${apply ? 'in Jira and cache' : 'in the local cache only (dry run; pass applyToJira=true to write to Jira)'}.`);
      } catch (e) {
        return err(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'transition_issue',
    {
      description: 'Move an issue through a named workflow transition (e.g. "In Review", "Done"). Always writes to real Jira.',
      inputSchema: {
        key: z.string().describe('The issue key.'),
        transitionName: z.string().describe('The exact transition name as shown in Jira.'),
        projectId,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, title: 'Transition issue' },
    },
    async ({ key, transitionName, projectId: pid }) => {
      const blocked = denied();
      if (blocked) return blocked;
      const s = resolve(pid);
      if ('error' in s) return err(s.error);
      try {
        await s.transitionIssue(key, transitionName);
        return ok(`Transitioned ${key} → "${transitionName}".`);
      } catch (e) {
        return err(`Transition failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  return server;
}
