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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Issue } from '@jira-explorer/shared';
import type { AppConfig } from '../config';
import type { StoredTree } from '../db/repositories';
import { computeCoverageProxy } from '../core/coverage';
import { ProjectStore } from '../db/projects';
import { Workspace } from '../workspace';
import { buildMcpServer } from './server';

const issue = (key: string, level: Issue['level'], over: Partial<Issue> = {}): Issue => ({
  key,
  level,
  summary: `${key} summary`,
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: '',
  updated: '',
  ...over,
});

const textOf = (r: any) => (r.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');

describe('MCP server', () => {
  let dir: string;
  let ws: Workspace;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'je-mcp-'));
  });
  afterEach(() => {
    ws.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function connect(allowWrite: boolean) {
    const config: AppConfig = {
      port: 0,
      dataDir: dir,
      encryptionKey: 'k',
      jira: {},
      mcp: { allowWrite, applyToJira: false },
    };
    ws = new Workspace(dir, new ProjectStore(dir, 'k'), config);
    const project = ws.createProject({ name: 'test', baseUrl: '' });
    const svc = ws.getService(project.id)!;
    const tree: StoredTree = {
      issues: [
        issue('PLAT-1042', 'requirement', {
          acceptanceCriteria: [
            { id: 'AC-1', text: 'Tokenized' },
            { id: 'AC-2', text: 'Refunds' },
          ],
        }),
        issue('E1', 'epic', { summary: 'Vault' }),
      ],
      links: [{ from: 'PLAT-1042', to: 'E1', rel: 'requirement-epic' }],
      milestones: [],
    };
    svc.repo.replaceTree('PLAT-1042', tree, 't0');
    svc.repo.recordCoverage('PLAT-1042', 'PLAT-1042', computeCoverageProxy(tree.issues[0]!, [tree.issues[1]!]), 't0');
    svc.repo.recordSyncRun({ rootKey: 'PLAT-1042', issueCount: 2, epicCount: 1, taskCount: 0, milestoneCount: 0, failedKeys: [], syncedAt: 't0' });

    const server = buildMcpServer(ws, config);
    const client = new Client({ name: 'test', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  }

  it('lists the domain tools', async () => {
    const client = await connect(true);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('list_projects');
    expect(names).toContain('get_requirement_coverage');
    expect(names).toContain('update_epic');
  });

  it('list_projects returns the created project', async () => {
    const client = await connect(true);
    const res = await client.callTool({ name: 'list_projects', arguments: {} });
    expect(textOf(res)).toContain('"name": "test"');
  });

  it('get_requirement_coverage returns the coverage pack', async () => {
    const client = await connect(true);
    const res = await client.callTool({ name: 'get_requirement_coverage', arguments: { rootKey: 'PLAT-1042' } });
    const text = textOf(res);
    expect(text).toContain('[AC-1] Tokenized');
    expect(text).toContain('Coverage check (for the reviewing LLM)');
  });

  it('blocks writes when MCP_ALLOW_WRITE is false', async () => {
    const client = await connect(false);
    const res = (await client.callTool({ name: 'update_epic', arguments: { key: 'E1', summary: 'x' } })) as any;
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Writes are disabled');
  });

  it('update_epic dry-run updates the cache only', async () => {
    const client = await connect(true);
    const res = await client.callTool({ name: 'update_epic', arguments: { key: 'E1', summary: 'Renamed' } });
    expect(textOf(res)).toContain('local cache only');
  });
});
