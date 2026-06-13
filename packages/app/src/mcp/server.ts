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

// The MCP server exposes the requirement-coverage MODEL to an LLM (not raw Jira CRUD): the soul of
// the product. Every tool wraps the same ExplorerService the REST UI uses, so LLM and UI behave
// identically. Writes are gated by MCP_ALLOW_WRITE; epic writes honor an applyToJira flag
// (cache-only vs real Jira). See docs/mcp.md.

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
const err = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });
const json = (v: unknown) => JSON.stringify(v, null, 2);

export function buildMcpServer(service: ExplorerService, config: AppConfig): McpServer {
  const server = new McpServer({ name: 'jira-explorer', version: '0.1.0' });
  const writesAllowed = config.mcp.allowWrite;

  // ── reads ──────────────────────────────────────────────────────────────────
  server.registerTool(
    'list_requirements',
    {
      description:
        'List the requirement keys that have been synced into the local cache, with their last sync time. Start here to discover what is available before calling get_hierarchy or get_requirement_coverage.',
      inputSchema: {},
      annotations: { readOnlyHint: true, title: 'List synced requirements' },
    },
    async () => ok(json(service.listRoots())),
  );

  server.registerTool(
    'get_hierarchy',
    {
      description:
        'Return the full requirement tree (requirement → epics → tasks, with milestones and the deterministic coverage proxy) as JSON, from the local cache. Call sync first if it is stale.',
      inputSchema: {
        rootKey: z.string().describe('The requirement issue key, e.g. "PLAT-1042".'),
      },
      annotations: { readOnlyHint: true, title: 'Get requirement hierarchy' },
    },
    async ({ rootKey }) => {
      const h = service.getHierarchy(rootKey);
      return h ? ok(json(h)) : err(`No cached hierarchy for ${rootKey}. Run sync("${rootKey}") first.`);
    },
  );

  server.registerTool(
    'get_issue',
    {
      description: 'Return a single cached issue (requirement, epic, or task) by key.',
      inputSchema: { key: z.string().describe('The issue key, e.g. "PLAT-1190".') },
      annotations: { readOnlyHint: true, title: 'Get issue' },
    },
    async ({ key }) => {
      const i = service.getIssue(key);
      return i ? ok(json(i)) : err(`Issue ${key} not in cache.`);
    },
  );

  server.registerTool(
    'get_requirement_coverage',
    {
      description:
        'THE COVERAGE CHECK. Returns an LLM-ready context pack for a requirement: its acceptance criteria, every linked epic (with status, delivery date, description) and their tasks, plus an explicit instruction to verify which epic implements each criterion. Use this to answer "is requirement X fully covered by its epics?" and cite epic keys. The deterministic proxy (criteria count + linked-epic count) is included but is NOT a per-criterion verdict — that is your job from the text.',
      inputSchema: { rootKey: z.string().describe('The requirement issue key to check.') },
      annotations: { readOnlyHint: true, title: 'Get requirement coverage pack' },
    },
    async ({ rootKey }) => {
      const pack = service.exportContext(rootKey, 'md');
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
      },
      annotations: { readOnlyHint: true, title: 'Export requirement tree' },
    },
    async ({ rootKey, format }) => {
      const out = service.exportContext(rootKey, format);
      return out ? ok(out.body) : err(`No cached hierarchy for ${rootKey}.`);
    },
  );

  server.registerTool(
    'get_profile',
    {
      description: 'Return the active Profile: how the abstract Requirement/Epic/Task/Milestone levels map onto this Jira instance (issue types, link types, field ids, where acceptance criteria live).',
      inputSchema: {},
      annotations: { readOnlyHint: true, title: 'Get profile' },
    },
    async () => ok(json(service.getProfile())),
  );

  // ── writes (gated) ─────────────────────────────────────────────────────────
  const guard = () =>
    writesAllowed ? null : err('Writes are disabled on this server (set MCP_ALLOW_WRITE=true to enable).');

  server.registerTool(
    'sync',
    {
      description:
        'Fetch a requirement and its whole tree (epics, tasks, milestones) from Jira into the local cache, replacing any previous sync of that requirement. Required before reads if the requirement has never been synced.',
      inputSchema: { rootKey: z.string().describe('The requirement issue key to sync, e.g. "PLAT-1042".') },
      annotations: { readOnlyHint: false, title: 'Sync from Jira' },
    },
    async ({ rootKey }) => {
      const blocked = guard();
      if (blocked) return blocked;
      try {
        return ok(json(await service.sync(rootKey)));
      } catch (e) {
        return err(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'update_epic',
    {
      description:
        'Update editable fields on an epic (summary, description, delivery date, labels). By default this writes to the LOCAL CACHE ONLY (a dry run). Pass applyToJira=true to also write the change to the real Jira instance. NEVER auto-apply a coverage conclusion — only apply concrete field edits the user asked for.',
      inputSchema: {
        key: z.string().describe('The epic issue key, e.g. "PLAT-1190".'),
        summary: z.string().optional().describe('New summary/title.'),
        description: z.string().optional().describe('New description (Jira wiki markup).'),
        deliveryDate: z.string().optional().describe('New delivery date as YYYY-MM-DD.'),
        labels: z.array(z.string()).optional().describe('Replacement labels array.'),
        applyToJira: z
          .boolean()
          .optional()
          .describe('If true, write to the real Jira; if false/omitted, update only the local cache (dry run).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, title: 'Update epic' },
    },
    async ({ key, applyToJira, ...patch }) => {
      const blocked = guard();
      if (blocked) return blocked;
      const apply = applyToJira ?? config.mcp.applyToJira;
      try {
        await service.updateEpic(key, patch, apply);
        return ok(`Updated ${key} ${apply ? 'in Jira and cache' : 'in the local cache only (dry run; pass applyToJira=true to write to Jira)'}.`);
      } catch (e) {
        return err(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'transition_issue',
    {
      description: 'Move an issue through a named workflow transition (e.g. "In Review", "Done"). This always writes to the real Jira instance.',
      inputSchema: {
        key: z.string().describe('The issue key.'),
        transitionName: z.string().describe('The exact transition name as shown in Jira, e.g. "Done".'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, title: 'Transition issue' },
    },
    async ({ key, transitionName }) => {
      const blocked = guard();
      if (blocked) return blocked;
      try {
        await service.transitionIssue(key, transitionName);
        return ok(`Transitioned ${key} → "${transitionName}".`);
      } catch (e) {
        return err(`Transition failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  return server;
}
