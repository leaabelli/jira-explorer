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
import type { Hierarchy, Issue } from '@jira-explorer/shared';
import { toContextMarkdown, toCoverageSummary, toJsonExport, toStaticHtml } from './index';

const issue = (key: string, level: Issue['level'], over: Partial<Issue> = {}): Issue => ({
  key,
  level,
  summary: `${key} summary`,
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: '',
  updated: '',
  ...over,
});

const h: Hierarchy = {
  root: {
    issue: issue('PLAT-1042', 'requirement', {
      summary: 'Saved payment methods',
      acceptanceCriteria: [
        { id: 'AC-1', text: 'Tokenized' },
        { id: 'AC-2', text: 'Refund 30d' },
      ],
    }),
    coverage: { kind: 'proxy', criteriaCount: 2, linkedEpicCount: 1, criteriaUnavailable: false },
    children: [
      {
        issue: issue('E1', 'epic', { summary: 'Vault', deliveryDate: '2026-08-29' }),
        children: [{ issue: issue('T1', 'task', { summary: 'Encrypt' }), children: [] }],
      },
    ],
  },
  milestones: [{ key: 'M1', name: 'Q3', dueDate: '2026-09-30', epicKeys: ['E1'], url: '' }],
  issuesByKey: {},
};

describe('exports', () => {
  it('markdown context pack includes requirement, AC, epics, and the coverage instruction', () => {
    const md = toContextMarkdown(h);
    expect(md).toContain('# Requirement PLAT-1042: Saved payment methods');
    expect(md).toContain('- [AC-1] Tokenized');
    expect(md).toContain('### E1: Vault');
    expect(md).toContain('- T1 Encrypt (Open)');
    expect(md).toContain('## Coverage check (for the reviewing LLM)');
    expect(md).toContain('covered: X/N');
  });

  it('coverage summary is short + paste-ready', () => {
    expect(toCoverageSummary(h)).toBe(
      '**Coverage — PLAT-1042: Saved payment methods**\n2 acceptance criteria · 1 epics linked\nEpics: E1',
    );
  });

  it('json export nests the tree', () => {
    const json = toJsonExport(h) as any;
    expect(json.requirement.key).toBe('PLAT-1042');
    expect(json.requirement.children[0].key).toBe('E1');
    expect(json.requirement.children[0].children[0].key).toBe('T1');
    expect(json.milestones[0].name).toBe('Q3');
  });

  it('static html escapes + lists the tree', () => {
    const html = toStaticHtml({
      ...h,
      root: { ...h.root, issue: issue('PLAT-1042', 'requirement', { summary: 'A & <b>' }) },
    });
    expect(html).toContain('A &amp; &lt;b&gt;');
    expect(html).toContain('<!doctype html>');
  });
});
