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
import { DEFAULT_PROFILE, parseProfile } from './profile';
import { buildProfile, profileToForm } from './profile-form';

describe('profile-form round-trip', () => {
  it('DEFAULT_PROFILE survives profileToForm -> buildProfile', () => {
    expect(buildProfile(profileToForm(DEFAULT_PROFILE))).toEqual(DEFAULT_PROFILE);
  });

  it('builds a custom profile (custom-field AC, mixed links, epicLinkFieldId)', () => {
    const form = profileToForm(DEFAULT_PROFILE);
    form.requirement.ac = { kind: 'custom-field', fieldId: 'customfield_20001' };
    form.epic.parent = { kind: 'epic-link' };
    form.task.parent = { kind: 'issue-link', linkType: 'subtask-of', direction: 'inward' };
    form.epicLinkFieldId = 'customfield_10100';
    form.milestone.enabled = false;

    const p = buildProfile(form);
    expect(p.levels[0]!.acceptanceCriteria).toEqual({ kind: 'custom-field', fieldId: 'customfield_20001' });
    expect(p.levels[1]!.parentLink).toEqual({ kind: 'epic-link' });
    expect(p.levels[2]!.parentLink).toEqual({ kind: 'issue-link', linkType: 'subtask-of', direction: 'inward' });
    expect(p.jira?.epicLinkFieldId).toBe('customfield_10100');
    expect(p.milestone).toBeUndefined();
  });

  it('the built profile is valid against the schema', () => {
    const form = profileToForm(DEFAULT_PROFILE);
    form.requirement.ac = { kind: 'checklist-field', fieldId: 'customfield_3' };
    expect(() => parseProfile(buildProfile(form))).not.toThrow();
  });

  it('description-section defaults the heading when blank', () => {
    const form = profileToForm(DEFAULT_PROFILE);
    form.requirement.ac = { kind: 'description-section', heading: '' };
    const p = buildProfile(form);
    expect(p.levels[0]!.acceptanceCriteria).toEqual({ kind: 'description-section', heading: 'Acceptance Criteria' });
  });
});
