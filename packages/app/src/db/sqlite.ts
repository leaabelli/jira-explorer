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

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations } from './migrations';

export type DB = Database.Database;

/** Open (or create) the SQLite cache at `path`. Use ':memory:' for tests. */
export function createDb(path: string): DB {
  const db = new Database(path);
  if (path !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/** Open the cache inside a data directory (creates the directory if needed). */
export function openDb(dataDir: string): DB {
  mkdirSync(dataDir, { recursive: true });
  return createDb(join(dataDir, 'jira-explorer.sqlite'));
}
