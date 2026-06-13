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

import type { Hierarchy, HierarchyNode, Issue } from '@jira-explorer/shared';
import { computeCoverageProxy } from '../core/coverage';
import type { StoredTree } from '../db/repositories';

// Build the requirement-rooted tree the UI/MCP/export consume. Pure + testable.
// Guards: cycles (visited set), orphan links (skip missing issues), milestone overlay.
export function buildHierarchy(rootKey: string, tree: StoredTree): Hierarchy | null {
  const issuesByKey: Record<string, Issue> = {};
  for (const issue of tree.issues) {
    // clone so we can mutate milestoneKeys without touching the stored objects
    issuesByKey[issue.key] = { ...issue, milestoneKeys: [...issue.milestoneKeys] };
  }
  if (!issuesByKey[rootKey]) return null;

  const childrenOf = new Map<string, string[]>();
  for (const l of tree.links) {
    if (!issuesByKey[l.from] || !issuesByKey[l.to]) continue; // orphan edge
    const arr = childrenOf.get(l.from) ?? [];
    if (!arr.includes(l.to)) arr.push(l.to);
    childrenOf.set(l.from, arr);
  }

  // milestone overlay: stamp membership onto epics
  for (const m of tree.milestones) {
    for (const ek of m.epicKeys) {
      const epic = issuesByKey[ek];
      if (epic && !epic.milestoneKeys.includes(m.key)) epic.milestoneKeys.push(m.key);
    }
  }

  const visited = new Set<string>();
  const build = (key: string): HierarchyNode | null => {
    const issue = issuesByKey[key];
    if (!issue || visited.has(key)) return null; // missing or cycle
    visited.add(key);
    const children = (childrenOf.get(key) ?? [])
      .map(build)
      .filter((n): n is HierarchyNode => n !== null);
    return { issue, children };
  };

  const root = build(rootKey)!;

  // coverage proxy on the requirement root
  const linkedEpics = (childrenOf.get(rootKey) ?? [])
    .map((k) => issuesByKey[k])
    .filter((i): i is Issue => !!i && i.level === 'epic');
  root.coverage = computeCoverageProxy(root.issue, linkedEpics);

  return { root, milestones: tree.milestones, issuesByKey };
}
