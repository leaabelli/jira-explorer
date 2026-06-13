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
import { parseAcceptanceCriteria } from './acceptance-criteria';
import { computeCoverageProxy } from './coverage';
import type { Issue } from '@jira-explorer/shared';

const issue = (over: Partial<Issue>): Issue => ({
  key: 'PLAT-1',
  level: 'requirement',
  summary: 's',
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: '',
  updated: '',
  ...over,
});

describe('parseAcceptanceCriteria — description-section', () => {
  it('parses a markdown section with checkboxes', () => {
    const description = [
      'Some intro prose.',
      '',
      '## Acceptance Criteria',
      '- [x] Saved cards are tokenized',
      '- [ ] Refund within 30 days',
      '* Express checkout button shown',
      '',
      '## Notes',
      '- not a criterion',
    ].join('\n');
    const ac = parseAcceptanceCriteria(
      { kind: 'description-section', heading: 'Acceptance Criteria' },
      { description },
    );
    expect(ac.map((c) => c.text)).toEqual([
      'Saved cards are tokenized',
      'Refund within 30 days',
      'Express checkout button shown',
    ]);
    expect(ac[0]!.checked).toBe(true);
    expect(ac[1]!.checked).toBe(false);
    expect(ac[0]!.id).toBe('AC-1');
  });

  it('parses Jira wiki markup headings and numbered lists', () => {
    const description = ['h3. Acceptance Criteria', '# first', '# second', 'h3. Out of scope', '# nope'].join(
      '\n',
    );
    const ac = parseAcceptanceCriteria(
      { kind: 'description-section', heading: 'Acceptance Criteria' },
      { description },
    );
    expect(ac.map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('returns [] when the heading is absent', () => {
    expect(
      parseAcceptanceCriteria(
        { kind: 'description-section', heading: 'Acceptance Criteria' },
        { description: 'no criteria here' },
      ),
    ).toEqual([]);
  });
});

describe('parseAcceptanceCriteria — fields', () => {
  it('custom-field with bullets', () => {
    const ac = parseAcceptanceCriteria(
      { kind: 'custom-field', fieldId: 'customfield_1' },
      { fieldValue: '- one\n- two' },
    );
    expect(ac.map((c) => c.text)).toEqual(['one', 'two']);
  });
  it('custom-field plain lines (no bullets) fall back to one-per-line', () => {
    const ac = parseAcceptanceCriteria(
      { kind: 'custom-field', fieldId: 'customfield_1' },
      { fieldValue: 'alpha\nbeta' },
    );
    expect(ac.map((c) => c.text)).toEqual(['alpha', 'beta']);
  });
  it('checklist-field as array of objects', () => {
    const ac = parseAcceptanceCriteria(
      { kind: 'checklist-field', fieldId: 'customfield_2' },
      { fieldValue: [{ text: 'a', checked: true }, { name: 'b' }] },
    );
    expect(ac.map((c) => c.text)).toEqual(['a', 'b']);
    expect(ac[0]!.checked).toBe(true);
  });
  it('none -> []', () => {
    expect(parseAcceptanceCriteria({ kind: 'none' }, { description: 'x' })).toEqual([]);
  });
});

describe('computeCoverageProxy', () => {
  it('counts criteria and linked epics', () => {
    const req = issue({
      acceptanceCriteria: [
        { id: 'AC-1', text: 'a' },
        { id: 'AC-2', text: 'b' },
      ],
    });
    const cov = computeCoverageProxy(req, [issue({ key: 'E1' }), issue({ key: 'E2' })]);
    expect(cov).toEqual({
      kind: 'proxy',
      criteriaCount: 2,
      linkedEpicCount: 2,
      criteriaUnavailable: false,
    });
  });
  it('marks unavailable when no criteria extracted', () => {
    expect(computeCoverageProxy(issue({}), []).criteriaUnavailable).toBe(true);
  });
});
