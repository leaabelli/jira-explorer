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

import type { Hierarchy, HierarchyNode } from '@jira-explorer/shared';

// Pure keyboard navigation over the requirement tree (T-A11Y). Arrow keys map to tree moves:
//   →/child : first child   ←/parent : parent   ↓/next : next sibling   ↑/prev : prev sibling

export type NavDir = 'child' | 'parent' | 'next' | 'prev';

interface Rel {
  parent?: string;
  children: string[];
}

export function indexHierarchy(root: HierarchyNode): Map<string, Rel> {
  const m = new Map<string, Rel>();
  const walk = (n: HierarchyNode, parent?: string) => {
    m.set(n.issue.key, { parent, children: n.children.map((c) => c.issue.key) });
    n.children.forEach((c) => walk(c, n.issue.key));
  };
  walk(root);
  return m;
}

/** Next key for a navigation direction, or null if the move isn't possible. */
export function navigate(hierarchy: Hierarchy, current: string | null, dir: NavDir): string | null {
  const m = indexHierarchy(hierarchy.root);
  const rootKey = hierarchy.root.issue.key;
  if (!current || !m.has(current)) return rootKey; // first move selects the root
  const rel = m.get(current)!;
  if (dir === 'child') return rel.children[0] ?? null;
  if (dir === 'parent') return rel.parent ?? null;
  if (!rel.parent) return null; // root has no siblings
  const siblings = m.get(rel.parent)!.children;
  const i = siblings.indexOf(current);
  return dir === 'next' ? (siblings[i + 1] ?? null) : (siblings[i - 1] ?? null);
}

export function dirForKey(key: string): NavDir | null {
  switch (key) {
    case 'ArrowRight':
      return 'child';
    case 'ArrowLeft':
      return 'parent';
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'prev';
    default:
      return null;
  }
}
