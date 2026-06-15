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
import { DEFAULT_PROFILE, levelByKey, scopeSchema } from '@criterio/shared';
import { childChunks, identityClause, scopeClause, chunk, rootJql } from './jql';
import { mapIssue, parentKeyOf, fieldsForLevel, type MapOptions } from './mappers';

const opts: MapOptions = { baseUrl: 'https://jira.acme.com', epicLinkFieldId: 'customfield_10014' };
const epicLevel = levelByKey(DEFAULT_PROFILE, 'epic')!;
const taskLevel = levelByKey(DEFAULT_PROFILE, 'task')!;
const reqLevel = levelByKey(DEFAULT_PROFILE, 'requirement')!;
const scope = scopeSchema.parse({ projectKeys: ['PLAT'], labels: [] });

describe('jql builders', () => {
  it('chunk splits arrays', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('identityClause for epics', () => {
    expect(identityClause(epicLevel.identity)).toBe('issuetype IN ("Epic")');
  });
  it('scopeClause', () => {
    expect(scopeClause(scope)).toBe('project IN (PLAT)');
  });
  it('rootJql', () => expect(rootJql('PLAT-1042')).toBe('key = PLAT-1042'));

  it('task children use batched Epic Link IN', () => {
    const chunks = childChunks(taskLevel, taskLevel.parentLink!, ['E1', 'E2'], scope);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.jql).toContain('"Epic Link" IN (E1, E2)');
    expect(chunks[0]!.jql).toContain('issuetype IN ("Task", "Story", "Sub-task", "Bug")');
    expect(chunks[0]!.knownParent).toBeUndefined();
  });
  it('epic children (issue-link) are one query per parent with knownParent', () => {
    const chunks = childChunks(epicLevel, epicLevel.parentLink!, ['PLAT-1042'], scope);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.jql).toContain('issue in linkedIssues(PLAT-1042, "implements")');
    expect(chunks[0]!.knownParent).toBe('PLAT-1042');
  });
  it('chunks epic-link IN at the chunk size', () => {
    const parents = Array.from({ length: 120 }, (_, i) => `E${i}`);
    const chunks = childChunks(taskLevel, taskLevel.parentLink!, parents, scope, 50);
    expect(chunks).toHaveLength(3); // 50 + 50 + 20
  });
});

describe('mapIssue (DC v2 shapes)', () => {
  const rawEpic = {
    key: 'PLAT-1190',
    fields: {
      summary: 'Tokenized card vault',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      assignee: { displayName: 'Leandro Abelli' },
      labels: ['payments'],
      duedate: '2026-08-29',
      updated: '2026-06-10T12:00:00.000+0000',
      customfield_10014: 'PLAT-1042',
    },
  };

  it('maps core fields', () => {
    const issue = mapIssue(rawEpic, epicLevel, opts);
    expect(issue).toMatchObject({
      key: 'PLAT-1190',
      level: 'epic',
      summary: 'Tokenized card vault',
      status: 'In Progress',
      statusCategory: 'in_progress',
      deliveryDate: '2026-08-29',
      labels: ['payments'],
      url: 'https://jira.acme.com/browse/PLAT-1190',
    });
    expect(issue.assignee).toEqual({ displayName: 'Leandro Abelli', initials: 'LA' });
  });

  it('extracts epic-link parent from the custom field', () => {
    expect(parentKeyOf(rawEpic, taskLevel.parentLink!, opts)).toBe('PLAT-1042');
  });

  it('extracts issue-link parent by type + direction', () => {
    const rawWithLink = {
      key: 'PLAT-1190',
      fields: {
        issuelinks: [
          { type: { name: 'blocks' }, outwardIssue: { key: 'X-1' } },
          { type: { name: 'implements' }, outwardIssue: { key: 'PLAT-1042' } },
        ],
      },
    };
    expect(parentKeyOf(rawWithLink, epicLevel.parentLink!, opts)).toBe('PLAT-1042');
  });

  it('maps a requirement with acceptance criteria from its description', () => {
    const rawReq = {
      key: 'PLAT-1042',
      fields: {
        summary: 'Checkout supports saved payment methods',
        status: { name: 'Open', statusCategory: { key: 'new' } },
        description: 'h3. Acceptance Criteria\n# Tokenized cards\n# Refund within 30 days',
      },
    };
    const issue = mapIssue(rawReq, reqLevel, opts);
    expect(issue.acceptanceCriteria.map((c) => c.text)).toEqual([
      'Tokenized cards',
      'Refund within 30 days',
    ]);
  });

  it('fieldsForLevel narrows + includes the epic-link field for tasks', () => {
    const fields = fieldsForLevel(taskLevel, opts);
    expect(fields).toContain('customfield_10014');
    expect(fields).toContain('duedate');
    expect(fields).toContain('summary');
  });
});
