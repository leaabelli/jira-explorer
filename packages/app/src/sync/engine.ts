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

import type { Profile, Scope, SyncResult } from '@jira-explorer/shared';
import type { TrackerAdapter } from '../core/adapter';
import { computeCoverageProxy } from '../core/coverage';
import type { CacheRepo, StoredTree } from '../db/repositories';

export class RootNotFoundError extends Error {
  constructor(readonly rootKey: string) {
    super(`Requirement ${rootKey} not found or out of scope`);
    this.name = 'RootNotFoundError';
  }
}

export interface SyncDeps {
  adapter: TrackerAdapter;
  repo: CacheRepo;
  /** injectable clock for deterministic tests */
  now?: () => string;
}

/**
 * Full root-down sync (eng-review D5): fetch the whole scoped tree via the adapter, replace the
 * cached subtree in one transaction, record a coverage snapshot (for drift, E2) and the run.
 *
 *   requirement ──issue-link──▶ epics ──"Epic Link"──▶ tasks
 *                    └─ milestones (overlay) ─┘
 */
export async function syncRoot(
  rootKey: string,
  profile: Profile,
  scope: Scope,
  deps: SyncDeps,
): Promise<SyncResult> {
  const { adapter, repo } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  const root = await adapter.fetchRoot(rootKey, profile, scope);
  if (!root) throw new RootNotFoundError(rootKey);

  const { issues: epics, links: epicLinks } = await adapter.fetchChildren(
    'epic',
    [rootKey],
    profile,
    scope,
  );
  const epicKeys = epics.map((e) => e.key);

  const { issues: tasks, links: taskLinks } = await adapter.fetchChildren(
    'task',
    epicKeys,
    profile,
    scope,
  );

  const milestones = await adapter.fetchMilestones(epicKeys, profile, scope);

  // stamp milestone membership onto epics
  const msByEpic = new Map<string, string[]>();
  for (const m of milestones) {
    for (const ek of m.epicKeys) {
      const arr = msByEpic.get(ek) ?? [];
      if (!arr.includes(m.key)) arr.push(m.key);
      msByEpic.set(ek, arr);
    }
  }
  for (const e of epics) e.milestoneKeys = msByEpic.get(e.key) ?? [];

  const tree: StoredTree = {
    issues: [root, ...epics, ...tasks],
    links: [...epicLinks, ...taskLinks],
    milestones,
  };

  const syncedAt = now();
  repo.replaceTree(rootKey, tree, syncedAt);
  repo.recordCoverage(rootKey, root.key, computeCoverageProxy(root, epics), syncedAt);

  const result: SyncResult = {
    rootKey,
    issueCount: tree.issues.length,
    epicCount: epics.length,
    taskCount: tasks.length,
    milestoneCount: milestones.length,
    failedKeys: [],
    syncedAt,
  };
  repo.recordSyncRun(result);
  return result;
}

/**
 * Incremental refresh (T-INCREMENTAL-SYNC): re-fetch only the cached issues that changed since the
 * last sync and UPDATE their fields in place. Cheap (one query per level, only changed issues), and
 * correct for what it claims. It does NOT discover new / deleted / moved issues — for that, run a
 * full {@link syncRoot}. Requires a prior full sync of the root.
 */
export async function syncRootIncremental(
  rootKey: string,
  profile: Profile,
  scope: Scope,
  deps: SyncDeps,
): Promise<SyncResult> {
  const { adapter, repo } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  const tree = repo.getTree(rootKey);
  if (!tree) throw new RootNotFoundError(rootKey); // never fully synced

  const since = repo.lastSyncedAt(rootKey) ?? '1970-01-01T00:00:00Z';
  const byLevel: Record<'requirement' | 'epic' | 'task', string[]> = { requirement: [], epic: [], task: [] };
  for (const i of tree.issues) byLevel[i.level].push(i.key);

  const changed = [];
  for (const lvl of ['requirement', 'epic', 'task'] as const) {
    if (byLevel[lvl].length) changed.push(...(await adapter.fetchUpdated(lvl, byLevel[lvl], since, profile, scope)));
  }
  repo.refreshIssues(rootKey, changed);

  const fresh = repo.getTree(rootKey)!;
  const req = fresh.issues.find((i) => i.level === 'requirement');
  const linkedEpicKeys = new Set(
    fresh.links.filter((l) => l.from === rootKey && l.rel === 'requirement-epic').map((l) => l.to),
  );
  const linkedEpics = fresh.issues.filter((i) => i.level === 'epic' && linkedEpicKeys.has(i.key));

  const syncedAt = now();
  if (req) repo.recordCoverage(rootKey, req.key, computeCoverageProxy(req, linkedEpics), syncedAt);

  const result: SyncResult = {
    rootKey,
    issueCount: fresh.issues.length,
    epicCount: fresh.issues.filter((i) => i.level === 'epic').length,
    taskCount: fresh.issues.filter((i) => i.level === 'task').length,
    milestoneCount: fresh.milestones.length,
    failedKeys: [],
    syncedAt,
  };
  repo.recordSyncRun(result);
  return result;
}
