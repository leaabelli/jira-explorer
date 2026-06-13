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

import type { Issue, Level, ParentLink, StatusCategory } from '@jira-explorer/shared';
import { initialsOf } from '@jira-explorer/shared';
import { parseAcceptanceCriteria } from '../core/acceptance-criteria';

// Map Jira Data Center REST v2 issue shapes -> domain. DC differs from Cloud v3: Epic Link is a
// custom field, descriptions are wiki markup / plain strings (not ADF). Pure + fixture-tested.

export interface RawIssue {
  key: string;
  fields?: Record<string, any>;
}

export interface MapOptions {
  baseUrl: string;
  /** DC "Epic Link" custom field id, e.g. customfield_10014 (instance-specific, O4) */
  epicLinkFieldId: string;
}

function statusCategory(raw: RawIssue): StatusCategory {
  const k = raw.fields?.status?.statusCategory?.key;
  if (k === 'new') return 'todo';
  if (k === 'indeterminate') return 'in_progress';
  if (k === 'done') return 'done';
  return 'unknown';
}

export function mapIssue(raw: RawIssue, level: Level, opts: MapOptions): Issue {
  const f = raw.fields ?? {};
  const deliveryField = level.fieldMap.deliveryDate ?? 'duedate';
  const assigneeName: string | undefined = f.assignee?.displayName;
  const description = typeof f.description === 'string' && f.description ? f.description : undefined;
  const ac = level.acceptanceCriteria;
  const acFieldValue =
    ac.kind === 'custom-field' || ac.kind === 'checklist-field' ? f[ac.fieldId] : undefined;

  return {
    key: raw.key,
    level: level.key,
    summary: f.summary ?? '',
    status: f.status?.name ?? 'Unknown',
    statusCategory: statusCategory(raw),
    assignee: assigneeName
      ? { displayName: assigneeName, initials: initialsOf(assigneeName) }
      : undefined,
    deliveryDate: f[deliveryField] || undefined,
    description,
    labels: Array.isArray(f.labels) ? f.labels : [],
    acceptanceCriteria: parseAcceptanceCriteria(ac, { description, fieldValue: acFieldValue }),
    milestoneKeys: [],
    url: `${opts.baseUrl.replace(/\/$/, '')}/browse/${raw.key}`,
    updated: f.updated ?? '',
  };
}

/** Extract the parent key a child links to (for building edges from a batched IN-query). */
export function parentKeyOf(
  raw: RawIssue,
  parentLink: ParentLink,
  opts: MapOptions,
): string | undefined {
  const f = raw.fields ?? {};
  switch (parentLink.kind) {
    case 'epic-link': {
      const v = f[opts.epicLinkFieldId] ?? f['Epic Link'] ?? f.epic?.key;
      return typeof v === 'string' ? v : undefined;
    }
    case 'parent':
      return f.parent?.key;
    case 'issue-link': {
      const links = Array.isArray(f.issuelinks) ? f.issuelinks : [];
      for (const l of links) {
        if (l.type?.name !== parentLink.linkType) continue;
        const parent = parentLink.direction === 'outward' ? l.outwardIssue : l.inwardIssue;
        if (parent?.key) return parent.key;
      }
      return undefined;
    }
    case 'jql':
      return undefined;
  }
}

/** Narrow the fields we request from /search for a level. */
export function fieldsForLevel(level: Level, opts: MapOptions): string[] {
  const f = [
    'summary',
    'status',
    'assignee',
    'issuetype',
    'labels',
    'updated',
    'description',
    level.fieldMap.deliveryDate ?? 'duedate',
  ];
  if (level.parentLink?.kind === 'epic-link') f.push(opts.epicLinkFieldId);
  if (level.parentLink?.kind === 'issue-link') f.push('issuelinks');
  if (level.parentLink?.kind === 'parent') f.push('parent');
  const ac = level.acceptanceCriteria;
  if (ac.kind === 'custom-field' || ac.kind === 'checklist-field') f.push(ac.fieldId);
  return Array.from(new Set(f));
}
