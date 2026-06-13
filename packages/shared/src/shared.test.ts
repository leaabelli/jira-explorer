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
import { deliveryBand, initialsOf } from './domain';
import { DEFAULT_PROFILE, parseProfile, levelByKey } from './profile';

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
