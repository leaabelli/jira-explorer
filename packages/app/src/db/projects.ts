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

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  DEFAULT_PROFILE,
  profileSchema,
  scopeSchema,
  type Project,
  type ProjectInput,
} from '@criterio/shared';
import { decryptSecret, encryptSecret } from './crypto';

interface Row {
  id: string;
  name: string;
  base_url: string;
  pat_enc: string | null;
  scope_json: string;
  profile_json: string;
  created_at: string;
  last_synced_at: string | null;
}

// Central registry of projects. Lives at <dataDir>/projects.sqlite, separate from the per-project
// caches. PATs are stored encrypted; getDecryptedPat is the only place they are exposed (to build
// the adapter), never via list()/get() which return the public Project DTO.
export class ProjectStore {
  private readonly db: Database.Database;

  constructor(
    dataDir: string,
    private readonly encKey: string,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new Database(join(dataDir, 'projects.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      pat_enc TEXT,
      scope_json TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_synced_at TEXT
    )`);
  }

  private toPublic(r: Row): Project {
    return {
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      hasPat: !!r.pat_enc,
      scope: scopeSchema.parse(JSON.parse(r.scope_json)),
      profile: profileSchema.parse(JSON.parse(r.profile_json)),
      createdAt: r.created_at,
      lastSyncedAt: r.last_synced_at ?? undefined,
    };
  }

  private row(id: string): Row | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
  }

  list(): Project[] {
    return (this.db.prepare('SELECT * FROM projects ORDER BY created_at').all() as Row[]).map((r) =>
      this.toPublic(r),
    );
  }

  get(id: string): Project | null {
    const r = this.row(id);
    return r ? this.toPublic(r) : null;
  }

  getDecryptedPat(id: string): string | null {
    const r = this.row(id);
    return r?.pat_enc ? decryptSecret(r.pat_enc, this.encKey) : null;
  }

  create(input: ProjectInput): Project {
    const id = randomUUID();
    const now = new Date().toISOString();
    const scope = scopeSchema.parse(input.scope ?? {});
    const profile = input.profile ? profileSchema.parse(input.profile) : DEFAULT_PROFILE;
    const patEnc = input.pat ? encryptSecret(input.pat, this.encKey) : null;
    this.db
      .prepare(
        `INSERT INTO projects (id,name,base_url,pat_enc,scope_json,profile_json,created_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(id, input.name, input.baseUrl ?? '', patEnc, JSON.stringify(scope), JSON.stringify(profile), now);
    return this.get(id)!;
  }

  /** Update fields present in `input`. PAT: undefined=keep, ''=clear, value=replace. */
  update(id: string, input: Partial<ProjectInput>): Project | null {
    const cur = this.row(id);
    if (!cur) return null;
    const name = input.name ?? cur.name;
    const baseUrl = input.baseUrl ?? cur.base_url;
    const scopeJson = input.scope ? JSON.stringify(scopeSchema.parse(input.scope)) : cur.scope_json;
    const profileJson = input.profile
      ? JSON.stringify(profileSchema.parse(input.profile))
      : cur.profile_json;
    const patEnc =
      input.pat === undefined ? cur.pat_enc : input.pat === '' ? null : encryptSecret(input.pat, this.encKey);
    this.db
      .prepare(
        `UPDATE projects SET name=?, base_url=?, pat_enc=?, scope_json=?, profile_json=? WHERE id=?`,
      )
      .run(name, baseUrl, patEnc, scopeJson, profileJson, id);
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  setLastSynced(id: string, ts: string): void {
    this.db.prepare('UPDATE projects SET last_synced_at = ? WHERE id = ?').run(ts, id);
  }

  close(): void {
    this.db.close();
  }
}
