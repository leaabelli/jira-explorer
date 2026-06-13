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

import type BetterSqlite3 from 'better-sqlite3';

// Simple forward-only migration runner. Each entry is a full SQL batch; the array index + 1
// is the schema version.
const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE issues (
    key TEXT PRIMARY KEY,
    root_key TEXT NOT NULL,
    level TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL,
    status_category TEXT NOT NULL,
    assignee_json TEXT,
    delivery_date TEXT,
    description TEXT,
    labels_json TEXT NOT NULL DEFAULT '[]',
    acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
    milestone_keys_json TEXT NOT NULL DEFAULT '[]',
    url TEXT NOT NULL DEFAULT '',
    updated TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_issues_root ON issues(root_key);

  CREATE TABLE links (
    root_key TEXT NOT NULL,
    from_key TEXT NOT NULL,
    to_key TEXT NOT NULL,
    rel TEXT NOT NULL
  );
  CREATE INDEX idx_links_root ON links(root_key);

  CREATE TABLE milestones (
    key TEXT NOT NULL,
    root_key TEXT NOT NULL,
    name TEXT NOT NULL,
    due_date TEXT,
    epic_keys_json TEXT NOT NULL DEFAULT '[]',
    url TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (key, root_key)
  );
  CREATE INDEX idx_milestones_root ON milestones(root_key);

  -- append-only: survives a full re-sync so coverage drift (E2) can be computed
  CREATE TABLE coverage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_key TEXT NOT NULL,
    requirement_key TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    criteria_count INTEGER NOT NULL,
    linked_epic_count INTEGER NOT NULL
  );
  CREATE INDEX idx_cov_req ON coverage_history(requirement_key);

  CREATE TABLE sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_key TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    issue_count INTEGER NOT NULL,
    epic_count INTEGER NOT NULL,
    task_count INTEGER NOT NULL,
    milestone_count INTEGER NOT NULL,
    failed_keys_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );
  `,
];

export function runMigrations(db: BetterSqlite3.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_meta LIMIT 1').get() as
    | { version: number }
    | undefined;
  let version = row?.version ?? 0;
  for (; version < MIGRATIONS.length; version++) {
    db.exec(MIGRATIONS[version]!);
  }
  db.prepare('DELETE FROM schema_meta').run();
  db.prepare('INSERT INTO schema_meta (version) VALUES (?)').run(MIGRATIONS.length);
}
