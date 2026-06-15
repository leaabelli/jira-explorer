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
import { deliveryBand, initialsOf, quarterOf, groupEpics } from './domain';
import type { Issue, Milestone } from './domain';
import { DEFAULT_PROFILE, parseProfile, levelByKey } from './profile';

const epic = (key: string, over: Partial<Issue> = {}): Issue => ({
  key,
  level: 'epic',
  summary: key,
  status: 'In Progress',
  statusCategory: 'in_progress',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: `http://jira/${key}`,
  updated: '2026-01-01T00:00:00Z',
  ...over,
});

describe('deliveryBand', () => {
  const today = '2026-06-13';
  it('overdue when past', () => expect(deliveryBand('2026-06-01', today)).toBe('overdue'));
  it('soon when within 30 days', () => expect(deliveryBand('2026-06-20', today)).toBe('soon'));
  it('soon on the boundary (30 days)', () =>
    expect(deliveryBand('2026-07-13', today)).toBe('soon'));
  it('later when far out', () => expect(deliveryBand('2026-09-01', today)).toBe('later'));
  it('today is soon', () => expect(deliveryBand(today, today)).toBe('soon'));
  it('garbage falls back to later', () => expect(deliveryBand('not-a-date', today)).toBe('later'));
});

describe('initialsOf', () => {
  it('two names -> first+last', () => expect(initialsOf('Rosa Khan')).toBe('RK'));
  it('one name -> first two', () => expect(initialsOf('Madonna')).toBe('MA'));
  it('three names -> first+last', () => expect(initialsOf('Ana De La Cruz')).toBe('AC'));
  it('empty -> ?', () => expect(initialsOf('   ')).toBe('?'));
});

describe('quarterOf', () => {
  it('maps months to quarters', () => {
    expect(quarterOf('2026-01-10')).toBe('2026-Q1');
    expect(quarterOf('2026-05-15')).toBe('2026-Q2');
    expect(quarterOf('2026-09-30')).toBe('2026-Q3');
    expect(quarterOf('2026-12-31')).toBe('2026-Q4');
  });
  it('missing or garbage -> No delivery date', () => {
    expect(quarterOf(undefined)).toBe('No delivery date');
    expect(quarterOf('not-a-date')).toBe('No delivery date');
  });
});

describe('groupEpics', () => {
  it('buckets by quarter, chronologically, with no-date last', () => {
    const epics = [
      epic('A', { deliveryDate: '2026-09-01' }), // Q3
      epic('B', { deliveryDate: '2026-02-01' }), // Q1
      epic('C'), // no date
      epic('D', { deliveryDate: '2026-02-20' }), // Q1
    ];
    const groups = groupEpics(epics, 'quarter', []);
    expect(groups.map((g) => g.id)).toEqual(['2026-Q1', '2026-Q3', 'No delivery date']);
    expect(groups[0]!.epicKeys.sort()).toEqual(['B', 'D']);
    expect(groups[2]!.epicKeys).toEqual(['C']);
  });

  it('buckets by milestone (ordered by due date), epics in many milestones appear in each', () => {
    const milestones: Milestone[] = [
      { key: 'M2', name: 'Later', dueDate: '2026-12-01', epicKeys: [], url: '' },
      { key: 'M1', name: 'Sooner', dueDate: '2026-06-01', epicKeys: [], url: '' },
    ];
    const epics = [
      epic('A', { milestoneKeys: ['M1', 'M2'] }),
      epic('B', { milestoneKeys: ['M2'] }),
      epic('C', {}), // no milestone
    ];
    const groups = groupEpics(epics, 'milestone', milestones);
    expect(groups.map((g) => g.id)).toEqual(['M1', 'M2', 'No milestone']);
    expect(groups[0]!.label).toBe('Sooner');
    expect(groups[0]!.epicKeys).toEqual(['A']);
    expect(groups[1]!.epicKeys.sort()).toEqual(['A', 'B']);
    expect(groups[2]!.epicKeys).toEqual(['C']);
  });
});

describe('profile', () => {
  it('default profile parses and has 3 levels', () => {
    expect(DEFAULT_PROFILE.levels).toHaveLength(3);
    expect(levelByKey(DEFAULT_PROFILE, 'requirement')?.displayName).toBe('Requirement');
  });
  it('requirement level has no parentLink', () => {
    expect(levelByKey(DEFAULT_PROFILE, 'requirement')?.parentLink).toBeUndefined();
  });
  it('task uses epic-link', () => {
    expect(levelByKey(DEFAULT_PROFILE, 'task')?.parentLink).toEqual({ kind: 'epic-link' });
  });
  it('rejects a profile with zero levels', () => {
    expect(() => parseProfile({ tracker: 'jira-dc', levels: [] })).toThrow();
  });
  it('applies acceptanceCriteria default of none', () => {
    const p = parseProfile({
      levels: [{ key: 'epic', displayName: 'E', identity: {} }],
    });
    expect(p.levels[0]!.acceptanceCriteria).toEqual({ kind: 'none' });
  });
});
