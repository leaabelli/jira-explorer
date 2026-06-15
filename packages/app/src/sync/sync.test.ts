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
import { DEFAULT_PROFILE, scopeSchema, type Issue } from '@jira-explorer/shared';
import { createDb, type DB } from '../db/sqlite';
import { CacheRepo } from '../db/repositories';
import { syncRoot, syncRootIncremental, RootNotFoundError } from './engine';
import { buildHierarchy } from './hierarchy';
import type { TrackerAdapter } from '../core/adapter';

const scope = scopeSchema.parse({ projectKeys: ['PLAT'] });

const mk = (key: string, level: Issue['level'], over: Partial<Issue> = {}): Issue => ({
  key,
  level,
  summary: key,
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: `http://j/${key}`,
  updated: '',
  ...over,
});

/** A canned in-memory tracker: 1 requirement (2 AC) -> 2 epics -> 2 tasks, 1 milestone. */
class FakeAdapter implements TrackerAdapter {
  notFound = false;
  async testConnection() {
    return { ok: true, user: 'tester' };
  }
  async fetchRoot(rootKey: string) {
    if (this.notFound) return null;
    return mk(rootKey, 'requirement', {
      acceptanceCriteria: [
        { id: 'AC-1', text: 'a' },
        { id: 'AC-2', text: 'b' },
      ],
    });
  }
  async fetchChildren(levelKey: 'epic' | 'task', parentKeys: string[]) {
    if (levelKey === 'epic') {
      return {
        issues: [mk('E1', 'epic'), mk('E2', 'epic')],
        links: parentKeys.flatMap((p) => [
          { from: p, to: 'E1', rel: 'requirement-epic' as const },
          { from: p, to: 'E2', rel: 'requirement-epic' as const },
        ]),
      };
    }
    // tasks: T1 under E1, T2 under E2
    const issues = [mk('T1', 'task'), mk('T2', 'task')];
    const links = [
      { from: 'E1', to: 'T1', rel: 'epic-task' as const },
      { from: 'E2', to: 'T2', rel: 'epic-task' as const },
    ];
    return { issues, links };
  }
  async fetchMilestones() {
    return [{ key: 'M1', name: 'Q3', dueDate: '2026-09-30', epicKeys: ['E1'], url: 'http://j/M1' }];
  }
  /** issues to return from the next incremental fetchUpdated (by level) */
  updates: Issue[] = [];
  async fetchUpdated(levelKey: 'requirement' | 'epic' | 'task') {
    return this.updates.filter((i) => i.level === levelKey);
  }
  async updateEpic() {}
  async transitionIssue() {}
}

describe('syncRoot + buildHierarchy', () => {
  let db: DB;
  let repo: CacheRepo;
  beforeEach(() => {
    db = createDb(':memory:');
    repo = new CacheRepo(db);
  });

  it('syncs the full tree and reports counts', async () => {
    const result = await syncRoot('R1', DEFAULT_PROFILE, scope, {
      adapter: new FakeAdapter(),
      repo,
      now: () => 'T0',
    });
    expect(result).toMatchObject({
      rootKey: 'R1',
      issueCount: 5,
      epicCount: 2,
      taskCount: 2,
      milestoneCount: 1,
      syncedAt: 'T0',
    });
  });

  it('throws RootNotFoundError when the requirement is missing', async () => {
    const adapter = new FakeAdapter();
    adapter.notFound = true;
    await expect(syncRoot('R1', DEFAULT_PROFILE, scope, { adapter, repo })).rejects.toBeInstanceOf(
      RootNotFoundError,
    );
  });

  it('builds a hierarchy with coverage + milestone overlay', async () => {
    await syncRoot('R1', DEFAULT_PROFILE, scope, { adapter: new FakeAdapter(), repo, now: () => 'T0' });
    const h = buildHierarchy('R1', repo.getTree('R1')!)!;
    expect(h.root.issue.key).toBe('R1');
    expect(h.root.children.map((c) => c.issue.key).sort()).toEqual(['E1', 'E2']);
    const e1 = h.root.children.find((c) => c.issue.key === 'E1')!;
    expect(e1.children.map((c) => c.issue.key)).toEqual(['T1']);
    expect(e1.issue.milestoneKeys).toEqual(['M1']); // overlay stamped
    expect(h.root.coverage).toEqual({
      kind: 'proxy',
      criteriaCount: 2,
      linkedEpicCount: 2,
      criteriaUnavailable: false,
    });
  });

  it('records coverage history for drift', async () => {
    const deps = { adapter: new FakeAdapter(), repo, now: () => 'T0' };
    await syncRoot('R1', DEFAULT_PROFILE, scope, deps);
    await syncRoot('R1', DEFAULT_PROFILE, scope, { ...deps, now: () => 'T1' });
    expect(repo.coverageHistory('R1')).toHaveLength(2);
  });

  it('incremental refresh updates changed fields, leaves structure, ignores unknown keys', async () => {
    const adapter = new FakeAdapter();
    await syncRoot('R1', DEFAULT_PROFILE, scope, { adapter, repo, now: () => 'T0' });
    expect(repo.getIssue('E1')?.status).toBe('Open');

    // E1 changed status; an unknown key NEW-1 must be ignored (not added)
    adapter.updates = [
      mk('E1', 'epic', { status: 'Done', statusCategory: 'done', summary: 'E1 renamed' }),
      mk('NEW-1', 'epic'),
    ];
    const result = await syncRootIncremental('R1', DEFAULT_PROFILE, scope, { adapter, repo, now: () => 'T1' });

    expect(repo.getIssue('E1')).toMatchObject({ status: 'Done', summary: 'E1 renamed' });
    expect(repo.getIssue('NEW-1')).toBeNull(); // not discovered incrementally
    expect(result.issueCount).toBe(5); // structure unchanged
    expect(repo.coverageHistory('R1')).toHaveLength(2); // a snapshot was recorded
  });

  it('incremental sync requires a prior full sync', async () => {
    await expect(
      syncRootIncremental('R1', DEFAULT_PROFILE, scope, { adapter: new FakeAdapter(), repo }),
    ).rejects.toBeInstanceOf(RootNotFoundError);
  });
});
