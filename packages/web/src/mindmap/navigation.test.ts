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

import { describe, it, expect } from 'vitest';
import type { Hierarchy, HierarchyNode, Issue } from '@jira-explorer/shared';
import { navigate, dirForKey } from './navigation';

const issue = (key: string, level: Issue['level']): Issue => ({
  key,
  level,
  summary: key,
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: '',
  updated: '',
});
const node = (key: string, level: Issue['level'], children: HierarchyNode[] = []): HierarchyNode => ({
  issue: issue(key, level),
  children,
});

// R ─ E1 ─ T1
//   └ E2 ─ T2
const h: Hierarchy = {
  root: node('R', 'requirement', [
    node('E1', 'epic', [node('T1', 'task')]),
    node('E2', 'epic', [node('T2', 'task')]),
  ]),
  milestones: [],
  issuesByKey: {},
};

describe('navigate', () => {
  it('first move (no selection) picks the root', () => {
    expect(navigate(h, null, 'next')).toBe('R');
  });
  it('child goes to the first child', () => {
    expect(navigate(h, 'R', 'child')).toBe('E1');
    expect(navigate(h, 'E1', 'child')).toBe('T1');
  });
  it('parent goes up', () => {
    expect(navigate(h, 'T1', 'parent')).toBe('E1');
    expect(navigate(h, 'E1', 'parent')).toBe('R');
  });
  it('next/prev move among siblings', () => {
    expect(navigate(h, 'E1', 'next')).toBe('E2');
    expect(navigate(h, 'E2', 'prev')).toBe('E1');
  });
  it('returns null at boundaries', () => {
    expect(navigate(h, 'T1', 'child')).toBeNull(); // leaf
    expect(navigate(h, 'R', 'parent')).toBeNull(); // root
    expect(navigate(h, 'E2', 'next')).toBeNull(); // last sibling
    expect(navigate(h, 'R', 'next')).toBeNull(); // root has no siblings
  });
});

describe('dirForKey', () => {
  it('maps arrows', () => {
    expect(dirForKey('ArrowRight')).toBe('child');
    expect(dirForKey('ArrowLeft')).toBe('parent');
    expect(dirForKey('ArrowDown')).toBe('next');
    expect(dirForKey('ArrowUp')).toBe('prev');
    expect(dirForKey('Enter')).toBeNull();
  });
});
