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

import type {
  ConnectionStatus,
  EpicPatch,
  Issue,
  Link,
  Milestone,
  Profile,
  Scope,
} from '@jira-explorer/shared';
import { levelByKey } from '@jira-explorer/shared';
import type { TrackerAdapter } from '../core/adapter';
import { JiraClient, JiraError, type FetchFn } from './client';
import { childChunks, identityClause, scopeClause } from './jql';
import { fieldsForLevel, mapIssue, parentKeyOf, type MapOptions, type RawIssue } from './mappers';

export interface JiraAdapterOptions {
  baseUrl: string;
  pat: string;
  /** DC Epic Link custom field id (O4); default is a common one */
  epicLinkFieldId?: string;
  fetchFn?: FetchFn;
}

// The Jira Data Center implementation of the tracker-agnostic TrackerAdapter seam.
export class JiraAdapter implements TrackerAdapter {
  private readonly client: JiraClient;
  private readonly mapOpts: MapOptions;

  constructor(opts: JiraAdapterOptions) {
    this.client = new JiraClient({ baseUrl: opts.baseUrl, pat: opts.pat, fetchFn: opts.fetchFn });
    this.mapOpts = {
      baseUrl: opts.baseUrl,
      epicLinkFieldId: opts.epicLinkFieldId ?? 'customfield_10014',
    };
  }

  async testConnection(): Promise<ConnectionStatus> {
    try {
      const me = await this.client.myself();
      return { ok: true, user: me.displayName, baseUrl: this.mapOpts.baseUrl };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        baseUrl: this.mapOpts.baseUrl,
      };
    }
  }

  async fetchRoot(rootKey: string, profile: Profile): Promise<Issue | null> {
    const level = levelByKey(profile, 'requirement');
    if (!level) return null;
    try {
      const raw = await this.client.getIssue(rootKey, fieldsForLevel(level, this.mapOpts));
      return mapIssue(raw, level, this.mapOpts);
    } catch (e) {
      if (e instanceof JiraError && e.code === 'not_found') return null;
      throw e;
    }
  }

  async fetchChildren(
    levelKey: 'epic' | 'task',
    parentKeys: string[],
    profile: Profile,
    scope: Scope,
  ): Promise<{ issues: Issue[]; links: Link[] }> {
    const level = levelByKey(profile, levelKey);
    if (!level?.parentLink || parentKeys.length === 0) return { issues: [], links: [] };
    const fields = fieldsForLevel(level, this.mapOpts);
    const rel: Link['rel'] = levelKey === 'epic' ? 'requirement-epic' : 'epic-task';

    const issues: Issue[] = [];
    const links: Link[] = [];
    const seen = new Set<string>();

    for (const ch of childChunks(level, level.parentLink, parentKeys, scope)) {
      for await (const raw of this.client.search(ch.jql, fields)) {
        if (!seen.has(raw.key)) {
          seen.add(raw.key);
          issues.push(mapIssue(raw, level, this.mapOpts));
        }
        const parent = ch.knownParent ?? parentKeyOf(raw, level.parentLink, this.mapOpts);
        if (parent) links.push({ from: parent, to: raw.key, rel });
      }
    }
    return { issues, links };
  }

  async fetchMilestones(epicKeys: string[], profile: Profile, scope: Scope): Promise<Milestone[]> {
    const ms = profile.milestone;
    if (!ms || epicKeys.length === 0) return [];
    // milestone -> epic membership is expressed as an issue link
    if (ms.link.kind !== 'issue-link') return [];
    const { linkType, direction } = ms.link;
    const epicSet = new Set(epicKeys);
    const dueField = ms.dueDateField ?? 'duedate';
    const fields = ['summary', 'issuelinks', dueField];
    const jql = [identityClause(ms.identity), scopeClause(scope)].filter(Boolean).join(' AND ');

    const milestones: Milestone[] = [];
    for await (const raw of this.client.search(jql || 'order by created', fields)) {
      const member = memberEpics(raw, linkType, direction, epicSet);
      if (member.length === 0) continue;
      milestones.push({
        key: raw.key,
        name: raw.fields?.summary ?? raw.key,
        dueDate: raw.fields?.[dueField] || undefined,
        epicKeys: member,
        url: `${this.mapOpts.baseUrl.replace(/\/$/, '')}/browse/${raw.key}`,
      });
    }
    return milestones;
  }

  async updateEpic(key: string, patch: EpicPatch): Promise<void> {
    const fields: Record<string, unknown> = {};
    if (patch.summary !== undefined) fields.summary = patch.summary;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.deliveryDate !== undefined) fields.duedate = patch.deliveryDate;
    if (patch.labels !== undefined) fields.labels = patch.labels;
    if (patch.assigneeName !== undefined) fields.assignee = { name: patch.assigneeName };
    if (Object.keys(fields).length === 0) return;
    await this.client.updateIssue(key, fields);
  }

  async transitionIssue(key: string, transitionName: string): Promise<void> {
    const transitions = await this.client.listTransitions(key);
    const match = transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase(),
    );
    if (!match) {
      throw new JiraError(
        `No transition named "${transitionName}" from ${key} (available: ${transitions
          .map((t) => t.name)
          .join(', ')})`,
        400,
        'validation',
      );
    }
    await this.client.transition(key, match.id);
  }
}

function memberEpics(
  raw: RawIssue,
  linkType: string,
  direction: 'inward' | 'outward',
  epicSet: Set<string>,
): string[] {
  const links = Array.isArray(raw.fields?.issuelinks) ? raw.fields!.issuelinks : [];
  const out: string[] = [];
  for (const l of links) {
    if (l.type?.name !== linkType) continue;
    const epic = direction === 'outward' ? l.outwardIssue : l.inwardIssue;
    if (epic?.key && epicSet.has(epic.key)) out.push(epic.key);
  }
  return out;
}
