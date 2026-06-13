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

import type { Issue } from '@jira-explorer/shared';
import { loadConfig } from '../config';
import { ProjectStore } from '../db/projects';
import { Workspace } from '../workspace';
import type { StoredTree } from '../db/repositories';
import { computeCoverageProxy } from '../core/coverage';

// Dev-only: create a seeded project so the UI/mindmap can be exercised without a live Jira.
// Run: DATA_DIR=./data-qa npx tsx packages/app/src/dev/seed.ts

const person = (n: string) => ({ displayName: n, initials: n.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() });

const issue = (o: Partial<Issue> & Pick<Issue, 'key' | 'level' | 'summary'>): Issue => ({
  status: 'Open',
  statusCategory: 'todo',
  labels: [],
  acceptanceCriteria: [],
  milestoneKeys: [],
  url: `https://jira.example.com/browse/${o.key}`,
  updated: '2026-06-10T00:00:00Z',
  ...o,
});

const ROOT = 'PLAT-1042';
const tree: StoredTree = {
  issues: [
    issue({ key: ROOT, level: 'requirement', summary: 'Checkout supports saved payment methods', status: 'In Progress', statusCategory: 'in_progress',
      acceptanceCriteria: [
        { id: 'AC-1', text: 'Saved cards are tokenized' },
        { id: 'AC-2', text: 'One-click checkout for returning users' },
        { id: 'AC-3', text: 'Refund within 30 days' },
        { id: 'AC-4', text: 'PCI compliant storage' },
        { id: 'AC-5', text: 'Express pay button on cart' },
      ] }),
    issue({ key: 'PLAT-1190', level: 'epic', summary: 'Tokenized card vault', status: 'In Progress', statusCategory: 'in_progress', deliveryDate: '2026-08-29', assignee: person('Leandro Abelli'), milestoneKeys: ['M-Q3'] }),
    issue({ key: 'PLAT-1191', level: 'epic', summary: 'One-click checkout flow', status: 'Review', statusCategory: 'in_progress', deliveryDate: '2026-07-30', assignee: person('Rosa Khan'), milestoneKeys: ['M-Q3'] }),
    issue({ key: 'PLAT-1192', level: 'epic', summary: 'PCI compliance review', status: 'To Do', statusCategory: 'todo', deliveryDate: '2026-10-15', assignee: person('Marco Tulio') }),
    issue({ key: 'PLAT-2001', level: 'task', summary: 'Encrypt PAN at rest', status: 'Done', statusCategory: 'done', assignee: person('Leandro Abelli') }),
    issue({ key: 'PLAT-2002', level: 'task', summary: 'Vault API client', status: 'In Progress', statusCategory: 'in_progress', assignee: person('Diego Vega') }),
    issue({ key: 'PLAT-2003', level: 'task', summary: 'Express pay button', status: 'Review', statusCategory: 'in_progress', assignee: person('Rosa Khan') }),
    issue({ key: 'PLAT-2004', level: 'task', summary: 'Pen-test scope doc', status: 'To Do', statusCategory: 'todo', assignee: person('Marco Tulio') }),
  ],
  links: [
    { from: ROOT, to: 'PLAT-1190', rel: 'requirement-epic' },
    { from: ROOT, to: 'PLAT-1191', rel: 'requirement-epic' },
    { from: ROOT, to: 'PLAT-1192', rel: 'requirement-epic' },
    { from: 'PLAT-1190', to: 'PLAT-2001', rel: 'epic-task' },
    { from: 'PLAT-1190', to: 'PLAT-2002', rel: 'epic-task' },
    { from: 'PLAT-1191', to: 'PLAT-2003', rel: 'epic-task' },
    { from: 'PLAT-1192', to: 'PLAT-2004', rel: 'epic-task' },
  ],
  milestones: [
    { key: 'M-Q3', name: 'Q3 Launch', dueDate: '2026-09-30', epicKeys: ['PLAT-1190', 'PLAT-1191'], url: 'https://jira.example.com/browse/M-Q3' },
  ],
};

const config = loadConfig();
const store = new ProjectStore(config.dataDir, config.encryptionKey);
const ws = new Workspace(config.dataDir, store, config);
const project = ws.createProject({ name: 'Demo (seeded)', baseUrl: 'https://jira.example.com', scope: { projectKeys: ['PLAT'], labels: [] } });
const svc = ws.getService(project.id)!;
const now = new Date().toISOString();
svc.repo.replaceTree(ROOT, tree, now);
const epics = tree.issues.filter((i) => i.level === 'epic');
svc.repo.recordCoverage(ROOT, ROOT, computeCoverageProxy(tree.issues[0]!, epics), now);
svc.repo.recordSyncRun({ rootKey: ROOT, issueCount: tree.issues.length, epicCount: epics.length, taskCount: 4, milestoneCount: 1, failedKeys: [], syncedAt: now });
store.setLastSynced(project.id, now);
ws.close();
// eslint-disable-next-line no-console
console.log(`seeded project "${project.name}" (${project.id}) with ${tree.issues.length} issues`);
