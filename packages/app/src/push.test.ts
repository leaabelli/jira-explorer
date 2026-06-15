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

import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_PROFILE, scopeSchema, type EpicPatch, type Issue, type Project } from '@criterio/shared';
import type { AppConfig } from './config';
import type { TrackerAdapter } from './core/adapter';
import { CacheRepo, type StoredTree } from './db/repositories';
import { createDb, type DB } from './db/sqlite';
import { ExplorerService } from './services';

const mk = (key: string): Issue => ({
  key,
  level: 'epic',
  summary: key,
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: `http://j/${key}`,
  updated: '',
});

const tree: StoredTree = {
  issues: [{ ...mk('R1'), level: 'requirement' }, mk('E1'), mk('E2')],
  links: [
    { from: 'R1', to: 'E1', rel: 'requirement-epic' },
    { from: 'R1', to: 'E2', rel: 'requirement-epic' },
  ],
  milestones: [],
};

/** Records pushes; can be told to fail on specific keys to exercise per-key error reporting. */
class RecordingAdapter implements TrackerAdapter {
  pushed: Array<{ key: string; patch: EpicPatch }> = [];
  failOn = new Set<string>();
  async testConnection() {
    return { ok: true };
  }
  async fetchRoot() {
    return null;
  }
  async fetchChildren() {
    return { issues: [], links: [] };
  }
  async fetchMilestones() {
    return [];
  }
  async fetchUpdated() {
    return [];
  }
  async updateEpic(key: string, patch: EpicPatch) {
    if (this.failOn.has(key)) throw new Error(`boom ${key}`);
    this.pushed.push({ key, patch });
  }
  async transitionIssue() {}
}

const config: AppConfig = {
  port: 0,
  dataDir: '',
  encryptionKey: 'k',
  jira: { baseUrl: '', pat: '' },
  mcp: { allowWrite: true, applyToJira: false }, // edits stage by default
};

const project = {
  profile: DEFAULT_PROFILE,
  scope: scopeSchema.parse({ projectKeys: ['PLAT'] }),
} as Project;

describe('staged edits + pushAll', () => {
  let db: DB;
  let repo: CacheRepo;
  let adapter: RecordingAdapter;
  let svc: ExplorerService;
  beforeEach(() => {
    db = createDb(':memory:');
    repo = new CacheRepo(db);
    repo.replaceTree('R1', tree, 't0');
    adapter = new RecordingAdapter();
    svc = new ExplorerService(repo, adapter, project, config);
  });

  it('updateEpic stages locally (no Jira call) and updates the cache', async () => {
    await svc.updateEpic('E1', { summary: 'renamed' });
    expect(adapter.pushed).toHaveLength(0); // not pushed
    expect(repo.getIssue('E1')?.summary).toBe('renamed'); // cache updated
    expect(svc.pendingChanges('R1').map((p) => p.key)).toEqual(['E1']);
  });

  it('pushAll flushes every staged edit, clears them, and reports per-key failures', async () => {
    await svc.updateEpic('E1', { summary: 'a' });
    await svc.updateEpic('E2', { deliveryDate: '2026-09-01' });
    adapter.failOn.add('E2');

    const result = await svc.pushAll('R1');

    expect(result.pushed).toEqual(['E1']);
    expect(result.failed).toEqual([{ key: 'E2', error: 'boom E2' }]);
    expect(adapter.pushed.map((p) => p.key)).toEqual(['E1']);
    // E1 cleared, E2 still pending for retry
    expect(svc.pendingChanges('R1').map((p) => p.key)).toEqual(['E2']);
  });

  it('applyToJira=true pushes straight through and never stages', async () => {
    await svc.updateEpic('E1', { summary: 'direct' }, true);
    expect(adapter.pushed.map((p) => p.key)).toEqual(['E1']);
    expect(svc.pendingChanges()).toHaveLength(0);
  });
});
