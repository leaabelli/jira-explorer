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
import { DEFAULT_PROFILE, scopeSchema } from '@jira-explorer/shared';
import { JiraAdapter } from './adapter';
import type { FetchFn } from './client';

const scope = scopeSchema.parse({ projectKeys: ['PLAT'] });

function json(body: unknown, status = 200): Response {
  const noBody = status === 204 || body === null;
  return new Response(noBody ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fake Jira DC that routes by URL + method + JQL, recording write bodies. */
function fakeJira() {
  const puts: Array<{ key: string; fields: any }> = [];
  const fetchFn: FetchFn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;

    if (url.endsWith('/rest/api/2/myself')) return json({ displayName: 'Leandro Abelli' });

    if (url.includes('/rest/api/2/issue/PLAT-1042') && method === 'GET') {
      return json({
        key: 'PLAT-1042',
        fields: {
          summary: 'Checkout supports saved payment methods',
          status: { name: 'Open', statusCategory: { key: 'new' } },
          description: 'h3. Acceptance Criteria\n# Tokenized cards\n# Refund within 30 days',
        },
      });
    }

    if (url.endsWith('/rest/api/2/search') && method === 'POST') {
      const jql: string = body.jql;
      if (jql.includes('linkedIssues(PLAT-1042')) {
        return json({
          total: 1,
          issues: [
            {
              key: 'PLAT-1190',
              fields: {
                summary: 'Tokenized card vault',
                status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
                duedate: '2026-08-29',
                issuelinks: [{ type: { name: 'implements' }, outwardIssue: { key: 'PLAT-1042' } }],
              },
            },
          ],
        });
      }
      if (jql.includes('"Epic Link" IN (PLAT-1190)')) {
        return json({
          total: 1,
          issues: [
            {
              key: 'PLAT-2001',
              fields: { summary: 'Encrypt PAN', status: { name: 'Done', statusCategory: { key: 'done' } }, customfield_10014: 'PLAT-1190' },
            },
          ],
        });
      }
      if (jql.includes('issuetype IN ("Milestone")')) {
        return json({
          total: 1,
          issues: [
            {
              key: 'PLAT-9000',
              fields: {
                summary: 'Q3 Launch',
                duedate: '2026-09-30',
                issuelinks: [{ type: { name: 'includes' }, outwardIssue: { key: 'PLAT-1190' } }],
              },
            },
          ],
        });
      }
      return json({ total: 0, issues: [] });
    }

    if (url.match(/\/rest\/api\/2\/issue\/[^/]+\/transitions$/) && method === 'GET') {
      return json({ transitions: [{ id: '31', name: 'In Review' }, { id: '41', name: 'Done' }] });
    }
    if (url.match(/\/rest\/api\/2\/issue\/[^/]+\/transitions$/) && method === 'POST') {
      return json(null, 204);
    }
    if (url.match(/\/rest\/api\/2\/issue\/[^/]+$/) && method === 'PUT') {
      puts.push({ key: decodeURIComponent(url.split('/').pop()!), fields: body.fields });
      return json(null, 204);
    }
    return json({ errorMessages: ['not found'] }, 404);
  };
  return { fetchFn, puts };
}

describe('JiraAdapter (mocked DC)', () => {
  const make = () => {
    const fake = fakeJira();
    return { adapter: new JiraAdapter({ baseUrl: 'https://jira.acme.com', pat: 't', fetchFn: fake.fetchFn }), fake };
  };

  it('testConnection returns the user', async () => {
    const { adapter } = make();
    expect(await adapter.testConnection()).toEqual({
      ok: true,
      user: 'Leandro Abelli',
      baseUrl: 'https://jira.acme.com',
    });
  });

  it('fetchRoot maps the requirement + acceptance criteria', async () => {
    const { adapter } = make();
    const root = await adapter.fetchRoot('PLAT-1042', DEFAULT_PROFILE, scope);
    expect(root?.summary).toBe('Checkout supports saved payment methods');
    expect(root?.acceptanceCriteria).toHaveLength(2);
  });

  it('fetchChildren(epic) via issue-link returns epics + links', async () => {
    const { adapter } = make();
    const { issues, links } = await adapter.fetchChildren('epic', ['PLAT-1042'], DEFAULT_PROFILE, scope);
    expect(issues[0]?.key).toBe('PLAT-1190');
    expect(links).toEqual([{ from: 'PLAT-1042', to: 'PLAT-1190', rel: 'requirement-epic' }]);
  });

  it('fetchChildren(task) via Epic Link IN returns tasks + links', async () => {
    const { adapter } = make();
    const { issues, links } = await adapter.fetchChildren('task', ['PLAT-1190'], DEFAULT_PROFILE, scope);
    expect(issues[0]?.key).toBe('PLAT-2001');
    expect(links).toEqual([{ from: 'PLAT-1190', to: 'PLAT-2001', rel: 'epic-task' }]);
  });

  it('fetchMilestones filters to members', async () => {
    const { adapter } = make();
    const ms = await adapter.fetchMilestones(['PLAT-1190'], DEFAULT_PROFILE, scope);
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ key: 'PLAT-9000', name: 'Q3 Launch', epicKeys: ['PLAT-1190'] });
  });

  it('updateEpic maps deliveryDate -> duedate', async () => {
    const { adapter, fake } = make();
    await adapter.updateEpic('PLAT-1190', { deliveryDate: '2026-07-30', summary: 'New' });
    expect(fake.puts).toEqual([{ key: 'PLAT-1190', fields: { summary: 'New', duedate: '2026-07-30' } }]);
  });

  it('transitionIssue resolves a transition by name', async () => {
    const { adapter } = make();
    await expect(adapter.transitionIssue('PLAT-1190', 'in review')).resolves.toBeUndefined();
    await expect(adapter.transitionIssue('PLAT-1190', 'Nope')).rejects.toThrow(/No transition/);
  });
});
