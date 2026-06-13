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

import type { IdentityRule, Level, ParentLink, Scope } from '@jira-explorer/shared';

// Pure JQL builders for the Jira DC adapter. Kept separate so they are unit-testable without
// any HTTP. IN-clauses are chunked (eng-review D3) to stay under DC's JQL/URL limits.

export const DEFAULT_CHUNK_SIZE = 50;

/** Quote a JQL string value (labels, issue type names). Issue keys go unquoted in key/IN lists. */
export function jqlQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function identityClause(identity: IdentityRule): string {
  const parts: string[] = [];
  if (identity.issueTypes.length) {
    parts.push(`issuetype IN (${identity.issueTypes.map(jqlQuote).join(', ')})`);
  }
  if (identity.labels.length) {
    parts.push(`labels IN (${identity.labels.map(jqlQuote).join(', ')})`);
  }
  if (identity.jql) parts.push(`(${identity.jql})`);
  return parts.join(' AND ');
}

export function scopeClause(scope: Scope): string {
  const parts: string[] = [];
  if (scope.projectKeys.length) parts.push(`project IN (${scope.projectKeys.join(', ')})`);
  if (scope.labels.length) parts.push(`labels IN (${scope.labels.map(jqlQuote).join(', ')})`);
  if (scope.extraJql) parts.push(`(${scope.extraJql})`);
  return parts.join(' AND ');
}

function and(...clauses: string[]): string {
  return clauses.filter(Boolean).join(' AND ');
}

/** JQL to fetch the root requirement by key. */
export function rootJql(rootKey: string): string {
  return `key = ${rootKey}`;
}

export interface ChildChunk {
  jql: string;
  /** set when the chunk is for exactly one parent (issue-link path) so links need no extraction */
  knownParent?: string;
}

/** Build the (possibly chunked) JQL queries that fetch a level's children of `parentKeys`. */
export function childChunks(
  level: Level,
  parentLink: ParentLink,
  parentKeys: string[],
  scope: Scope,
  chunkSize = DEFAULT_CHUNK_SIZE,
): ChildChunk[] {
  if (parentKeys.length === 0) return [];
  const base = and(identityClause(level.identity), scopeClause(scope));

  switch (parentLink.kind) {
    case 'epic-link':
      return chunk(parentKeys, chunkSize).map((ks) => ({
        jql: and(base, `"Epic Link" IN (${ks.join(', ')})`),
      }));
    case 'parent':
      return chunk(parentKeys, chunkSize).map((ks) => ({
        jql: and(base, `parent IN (${ks.join(', ')})`),
      }));
    case 'jql':
      return chunk(parentKeys, chunkSize).map((ks) => ({
        jql: and(base, parentLink.template.replace('{parentKeys}', ks.join(', '))),
      }));
    case 'issue-link':
      // core JQL linkedIssues() takes a single key, so one query per parent
      return parentKeys.map((p) => ({
        jql: and(base, `issue in linkedIssues(${p}, ${jqlQuote(parentLink.linkType)})`),
        knownParent: p,
      }));
  }
}
