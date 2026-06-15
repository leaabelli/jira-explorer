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
import { createDb, type DB } from './sqlite';
import { CacheRepo, type StoredTree } from './repositories';
import type { Issue } from '@criterio/shared';

const issue = (key: string, over: Partial<Issue> = {}): Issue => ({
  key,
  level: 'epic',
  summary: `summary ${key}`,
  status: 'In Progress',
  statusCategory: 'in_progress',
  labels: ['team-x'],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: `http://jira/${key}`,
  updated: '2026-06-13T00:00:00Z',
  ...over,
});

const tree = (rootKey: string): StoredTree => ({
  issues: [
    issue(rootKey, {
      level: 'requirement',
      acceptanceCriteria: [
        { id: 'AC-1', text: 'a' },
        { id: 'AC-2', text: 'b' },
      ],
    }),
    issue('E1', { assignee: { displayName: 'Rosa Khan', initials: 'RK' }, deliveryDate: '2026-08-01' }),
  ],
  links: [{ from: rootKey, to: 'E1', rel: 'requirement-epic' }],
  milestones: [{ key: 'M1', name: 'Q3', dueDate: '2026-09-30', epicKeys: ['E1'], url: 'http://jira/M1' }],
});

describe('CacheRepo', () => {
  let db: DB;
  let repo: CacheRepo;
  beforeEach(() => {
    db = createDb(':memory:');
    repo = new CacheRepo(db);
  });

  it('round-trips a tree', () => {
    repo.replaceTree('R1', tree('R1'), '2026-06-13T10:00:00Z');
    const got = repo.getTree('R1');
    expect(got?.issues).toHaveLength(2);
    expect(got?.links).toEqual([{ from: 'R1', to: 'E1', rel: 'requirement-epic' }]);
    expect(got?.milestones[0]).toMatchObject({ key: 'M1', epicKeys: ['E1'] });
    const epic = got?.issues.find((i) => i.key === 'E1');
    expect(epic?.assignee).toEqual({ displayName: 'Rosa Khan', initials: 'RK' });
    expect(epic?.deliveryDate).toBe('2026-08-01');
  });

  it('replaceTree replaces (does not accumulate)', () => {
    repo.replaceTree('R1', tree('R1'), 't1');
    const smaller: StoredTree = { issues: [issue('R1', { level: 'requirement' })], links: [], milestones: [] };
    repo.replaceTree('R1', smaller, 't2');
    expect(repo.getTree('R1')?.issues).toHaveLength(1);
  });

  it('getTree returns null for unknown root', () => {
    expect(repo.getTree('nope')).toBeNull();
  });

  it('applyEpicPatch updates cached fields', () => {
    repo.replaceTree('R1', tree('R1'), 't1');
    repo.applyEpicPatch('E1', { deliveryDate: '2026-07-30', assigneeName: 'John Park' });
    const epic = repo.getIssue('E1');
    expect(epic?.deliveryDate).toBe('2026-07-30');
    expect(epic?.assignee).toEqual({ displayName: 'John Park', initials: 'JP' });
  });

  it('coverage history survives a re-sync (drift, E2)', () => {
    repo.recordCoverage('R1', 'R1', { kind: 'proxy', criteriaCount: 5, linkedEpicCount: 4, criteriaUnavailable: false }, 't1');
    repo.replaceTree('R1', tree('R1'), 't2'); // full re-sync wipes issues, NOT history
    repo.recordCoverage('R1', 'R1', { kind: 'proxy', criteriaCount: 5, linkedEpicCount: 3, criteriaUnavailable: false }, 't2');
    const hist = repo.coverageHistory('R1');
    expect(hist).toHaveLength(2);
    expect(hist[0]!.linkedEpicCount).toBe(3); // newest first
    expect(hist[1]!.linkedEpicCount).toBe(4);
  });

  it('round-trips the full raw field object (full-fidelity capture)', () => {
    const withRaw: StoredTree = {
      issues: [
        issue('R1', { level: 'requirement' }),
        issue('E1', { raw: { customfield_10020: 13, sprint: ['S1', 'S2'], nested: { a: 1 } } }),
      ],
      links: [],
      milestones: [],
    };
    repo.replaceTree('R1', withRaw, 't1');
    expect(repo.getIssue('E1')?.raw).toEqual({
      customfield_10020: 13,
      sprint: ['S1', 'S2'],
      nested: { a: 1 },
    });
    // refreshIssues also persists updated raw
    repo.refreshIssues('R1', [issue('E1', { raw: { customfield_10020: 21 } })]);
    expect(repo.getIssue('E1')?.raw).toEqual({ customfield_10020: 21 });
  });

  it('staged pending changes: upsert merges, list/count scope by root, delete clears', () => {
    repo.upsertPending('E1', 'R1', { summary: 'new title' }, 't1');
    repo.upsertPending('E1', 'R1', { deliveryDate: '2026-09-01' }, 't2'); // merges
    repo.upsertPending('E9', 'R2', { labels: ['x'] }, 't3');

    expect(repo.getPending('E1')?.patch).toEqual({ summary: 'new title', deliveryDate: '2026-09-01' });
    expect(repo.countPending()).toBe(2);
    expect(repo.countPending('R1')).toBe(1);
    expect(repo.listPending('R1').map((p) => p.key)).toEqual(['E1']);

    repo.deletePending('E1');
    expect(repo.getPending('E1')).toBeNull();
    expect(repo.countPending()).toBe(1);
  });

  it('refreshIssues updates existing rows only (incremental) and reports lastSyncedAt', () => {
    repo.replaceTree('R1', tree('R1'), 't1');
    repo.recordSyncRun({ rootKey: 'R1', issueCount: 2, epicCount: 1, taskCount: 0, milestoneCount: 1, failedKeys: [], syncedAt: 't1' });
    expect(repo.lastSyncedAt('R1')).toBe('t1');
    expect(repo.allKeys('R1').sort()).toEqual(['E1', 'R1']);

    const n = repo.refreshIssues('R1', [
      issue('E1', { status: 'Done', statusCategory: 'done', summary: 'changed' }),
      issue('GHOST', { summary: 'not cached' }),
    ]);
    expect(n).toBe(1); // only E1 existed
    expect(repo.getIssue('E1')).toMatchObject({ status: 'Done', summary: 'changed' });
    expect(repo.getIssue('GHOST')).toBeNull();
  });
});
