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
  CoverageProxy,
  EpicPatch,
  Issue,
  Link,
  Milestone,
  PendingChange,
  SyncResult,
} from '@criterio/shared';
import { initialsOf } from '@criterio/shared';
import type { DB } from './sqlite';

export interface StoredTree {
  issues: Issue[];
  links: Link[];
  milestones: Milestone[];
}

export interface CoverageSnapshot {
  syncedAt: string;
  criteriaCount: number;
  linkedEpicCount: number;
}

interface IssueRow {
  key: string;
  level: string;
  summary: string;
  status: string;
  status_category: string;
  assignee_json: string | null;
  delivery_date: string | null;
  description: string | null;
  labels_json: string;
  acceptance_criteria_json: string;
  milestone_keys_json: string;
  url: string;
  updated: string;
  raw_json: string | null;
}

function rowToIssue(r: IssueRow): Issue {
  return {
    key: r.key,
    level: r.level as Issue['level'],
    summary: r.summary,
    status: r.status,
    statusCategory: r.status_category as Issue['statusCategory'],
    assignee: r.assignee_json ? JSON.parse(r.assignee_json) : undefined,
    deliveryDate: r.delivery_date ?? undefined,
    description: r.description ?? undefined,
    labels: JSON.parse(r.labels_json),
    acceptanceCriteria: JSON.parse(r.acceptance_criteria_json),
    milestoneKeys: JSON.parse(r.milestone_keys_json),
    url: r.url,
    updated: r.updated,
    raw: r.raw_json ? JSON.parse(r.raw_json) : undefined,
  };
}

/** All cache reads/writes. Writes go through transactions (eng-review: batch SQLite writes). */
export class CacheRepo {
  constructor(private readonly db: DB) {}

  /**
   * Full re-sync (eng-review D5): replace the entire subtree for `rootKey` in ONE transaction.
   * coverage_history and sync_runs are append-only and intentionally NOT touched here, so
   * coverage drift survives a re-sync.
   */
  replaceTree(rootKey: string, tree: StoredTree, syncedAt: string): void {
    const insIssue = this.db.prepare(
      `INSERT OR REPLACE INTO issues
       (key, root_key, level, summary, status, status_category, assignee_json, delivery_date,
        description, labels_json, acceptance_criteria_json, milestone_keys_json, url, updated, raw_json)
       VALUES (@key,@root_key,@level,@summary,@status,@status_category,@assignee_json,@delivery_date,
        @description,@labels_json,@acceptance_criteria_json,@milestone_keys_json,@url,@updated,@raw_json)`,
    );
    const insLink = this.db.prepare(
      `INSERT INTO links (root_key, from_key, to_key, rel) VALUES (?,?,?,?)`,
    );
    const insMs = this.db.prepare(
      `INSERT OR REPLACE INTO milestones (key, root_key, name, due_date, epic_keys_json, url)
       VALUES (?,?,?,?,?,?)`,
    );
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM issues WHERE root_key = ?').run(rootKey);
      this.db.prepare('DELETE FROM links WHERE root_key = ?').run(rootKey);
      this.db.prepare('DELETE FROM milestones WHERE root_key = ?').run(rootKey);
      for (const it of tree.issues) {
        insIssue.run({
          key: it.key,
          root_key: rootKey,
          level: it.level,
          summary: it.summary,
          status: it.status,
          status_category: it.statusCategory,
          assignee_json: it.assignee ? JSON.stringify(it.assignee) : null,
          delivery_date: it.deliveryDate ?? null,
          description: it.description ?? null,
          labels_json: JSON.stringify(it.labels),
          acceptance_criteria_json: JSON.stringify(it.acceptanceCriteria),
          milestone_keys_json: JSON.stringify(it.milestoneKeys),
          url: it.url,
          updated: it.updated,
          raw_json: it.raw ? JSON.stringify(it.raw) : null,
        });
      }
      for (const l of tree.links) insLink.run(rootKey, l.from, l.to, l.rel);
      for (const m of tree.milestones)
        insMs.run(m.key, rootKey, m.name, m.dueDate ?? null, JSON.stringify(m.epicKeys), m.url);
    });
    tx();
  }

  getTree(rootKey: string): StoredTree | null {
    const issues = (
      this.db.prepare('SELECT * FROM issues WHERE root_key = ?').all(rootKey) as IssueRow[]
    ).map(rowToIssue);
    if (issues.length === 0) return null;
    const links = this.db
      .prepare('SELECT from_key as "from", to_key as "to", rel FROM links WHERE root_key = ?')
      .all(rootKey) as Link[];
    const milestones = (
      this.db
        .prepare(
          'SELECT key, name, due_date as dueDate, epic_keys_json, url FROM milestones WHERE root_key = ?',
        )
        .all(rootKey) as Array<{
        key: string;
        name: string;
        dueDate: string | null;
        epic_keys_json: string;
        url: string;
      }>
    ).map((m) => ({
      key: m.key,
      name: m.name,
      dueDate: m.dueDate ?? undefined,
      epicKeys: JSON.parse(m.epic_keys_json) as string[],
      url: m.url,
    }));
    return { issues, links, milestones };
  }

  getIssue(key: string): Issue | null {
    const row = this.db.prepare('SELECT * FROM issues WHERE key = ?').get(key) as
      | IssueRow
      | undefined;
    return row ? rowToIssue(row) : null;
  }

  /** The synced root an issue belongs to, or null if it isn't cached. */
  rootKeyForIssue(key: string): string | null {
    const row = this.db.prepare('SELECT root_key FROM issues WHERE key = ?').get(key) as
      | { root_key: string }
      | undefined;
    return row?.root_key ?? null;
  }

  /** Update cached epic fields after a successful write-back, so the UI reflects the change. */
  applyEpicPatch(key: string, patch: EpicPatch): void {
    const cur = this.getIssue(key);
    if (!cur) return;
    const assignee =
      patch.assigneeName !== undefined
        ? { displayName: patch.assigneeName, initials: initialsOf(patch.assigneeName) }
        : cur.assignee;
    this.db
      .prepare(
        `UPDATE issues SET summary=?, description=?, delivery_date=?, labels_json=?, assignee_json=? WHERE key=?`,
      )
      .run(
        patch.summary ?? cur.summary,
        patch.description ?? cur.description ?? null,
        patch.deliveryDate ?? cur.deliveryDate ?? null,
        JSON.stringify(patch.labels ?? cur.labels),
        assignee ? JSON.stringify(assignee) : null,
        key,
      );
  }

  recordCoverage(
    rootKey: string,
    requirementKey: string,
    proxy: CoverageProxy,
    syncedAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO coverage_history (root_key, requirement_key, synced_at, criteria_count, linked_epic_count)
         VALUES (?,?,?,?,?)`,
      )
      .run(rootKey, requirementKey, syncedAt, proxy.criteriaCount, proxy.linkedEpicCount);
  }

  /** Coverage snapshots newest-first, for drift (E2). */
  coverageHistory(requirementKey: string, limit = 10): CoverageSnapshot[] {
    return this.db
      .prepare(
        `SELECT synced_at as syncedAt, criteria_count as criteriaCount, linked_epic_count as linkedEpicCount
         FROM coverage_history WHERE requirement_key = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(requirementKey, limit) as CoverageSnapshot[];
  }

  /** Most recent sync timestamp for a root, or null if never synced. */
  lastSyncedAt(rootKey: string): string | null {
    const row = this.db
      .prepare('SELECT MAX(synced_at) as ts FROM sync_runs WHERE root_key = ?')
      .get(rootKey) as { ts: string | null } | undefined;
    return row?.ts ?? null;
  }

  /** All cached issue keys for a root. */
  allKeys(rootKey: string): string[] {
    return (this.db.prepare('SELECT key FROM issues WHERE root_key = ?').all(rootKey) as Array<{ key: string }>).map(
      (r) => r.key,
    );
  }

  /**
   * Incremental refresh: UPDATE the mutable fields of issues that already exist under `rootKey`.
   * Issues whose key isn't already cached are ignored (new issues need a full sync). Returns the
   * number of rows updated. Structure (links/milestones) is untouched.
   */
  refreshIssues(rootKey: string, issues: Issue[]): number {
    const upd = this.db.prepare(
      `UPDATE issues SET summary=?, status=?, status_category=?, assignee_json=?, delivery_date=?,
       description=?, labels_json=?, acceptance_criteria_json=?, updated=?, raw_json=? WHERE key=? AND root_key=?`,
    );
    let n = 0;
    const tx = this.db.transaction(() => {
      for (const it of issues) {
        const r = upd.run(
          it.summary,
          it.status,
          it.statusCategory,
          it.assignee ? JSON.stringify(it.assignee) : null,
          it.deliveryDate ?? null,
          it.description ?? null,
          JSON.stringify(it.labels),
          JSON.stringify(it.acceptanceCriteria),
          it.updated,
          it.raw ? JSON.stringify(it.raw) : null,
          it.key,
          rootKey,
        );
        n += r.changes;
      }
    });
    tx();
    return n;
  }

  recordSyncRun(result: SyncResult): void {
    this.db
      .prepare(
        `INSERT INTO sync_runs (root_key, synced_at, issue_count, epic_count, task_count, milestone_count, failed_keys_json)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        result.rootKey,
        result.syncedAt,
        result.issueCount,
        result.epicCount,
        result.taskCount,
        result.milestoneCount,
        JSON.stringify(result.failedKeys),
      );
  }

  listRoots(): Array<{ rootKey: string; syncedAt: string }> {
    return this.db
      .prepare(
        `SELECT root_key as rootKey, MAX(synced_at) as syncedAt FROM sync_runs GROUP BY root_key ORDER BY syncedAt DESC`,
      )
      .all() as Array<{ rootKey: string; syncedAt: string }>;
  }

  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
      | { value_json: string }
      | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  }

  // ── staged write-back (pending changes) ──────────────────────────────────────

  /** Stage an edit locally. Merges into any existing pending patch for the same issue. */
  upsertPending(key: string, rootKey: string, patch: EpicPatch, at: string): void {
    const existing = this.getPending(key)?.patch ?? {};
    const merged: EpicPatch = { ...existing, ...patch };
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pending_changes (key, root_key, patch_json, updated_at)
         VALUES (?,?,?,?)`,
      )
      .run(key, rootKey, JSON.stringify(merged), at);
  }

  getPending(key: string): PendingChange | null {
    const row = this.db.prepare('SELECT * FROM pending_changes WHERE key = ?').get(key) as
      | { key: string; root_key: string; patch_json: string; updated_at: string }
      | undefined;
    return row
      ? { key: row.key, rootKey: row.root_key, patch: JSON.parse(row.patch_json), updatedAt: row.updated_at }
      : null;
  }

  /** All staged edits, optionally scoped to one root, newest-first. */
  listPending(rootKey?: string): PendingChange[] {
    const rows = (
      rootKey
        ? this.db
            .prepare('SELECT * FROM pending_changes WHERE root_key = ? ORDER BY updated_at DESC')
            .all(rootKey)
        : this.db.prepare('SELECT * FROM pending_changes ORDER BY updated_at DESC').all()
    ) as Array<{ key: string; root_key: string; patch_json: string; updated_at: string }>;
    return rows.map((r) => ({
      key: r.key,
      rootKey: r.root_key,
      patch: JSON.parse(r.patch_json),
      updatedAt: r.updated_at,
    }));
  }

  deletePending(key: string): void {
    this.db.prepare('DELETE FROM pending_changes WHERE key = ?').run(key);
  }

  countPending(rootKey?: string): number {
    const row = (
      rootKey
        ? this.db.prepare('SELECT COUNT(*) as n FROM pending_changes WHERE root_key = ?').get(rootKey)
        : this.db.prepare('SELECT COUNT(*) as n FROM pending_changes').get()
    ) as { n: number };
    return row.n;
  }
}
