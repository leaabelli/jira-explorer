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

import type { Project, ProjectInput } from '@criterio/shared';
import type { AppConfig } from './config';
import { CacheRepo } from './db/repositories';
import { ProjectStore } from './db/projects';
import { openCacheDb, type DB } from './db/sqlite';
import { JiraAdapter } from './jira/adapter';
import { ExplorerService } from './services';

// Resolves a per-project ExplorerService (own cache DB + adapter built from the project's
// connection). Services are cached and rebuilt when the project's connection/profile/scope change.
export class Workspace {
  private readonly cache = new Map<string, { db: DB; service: ExplorerService; sig: string }>();

  constructor(
    private readonly dataDir: string,
    readonly store: ProjectStore,
    private readonly config: AppConfig,
  ) {}

  /** Seed a "Default" project from env on first run, so the .env flow keeps working. */
  seedFromEnv(): void {
    if (this.store.list().length > 0) return;
    if (!this.config.jira.baseUrl) return;
    this.store.create({
      name: 'Default',
      baseUrl: this.config.jira.baseUrl,
      pat: this.config.jira.pat,
    });
  }

  getService(projectId: string): ExplorerService | null {
    const project = this.store.get(projectId);
    if (!project) return null;
    const sig = projectSig(project);
    const hit = this.cache.get(projectId);
    if (hit && hit.sig === sig) return hit.service;
    hit?.db.close();

    const db = openCacheDb(this.dataDir, projectId);
    const repo = new CacheRepo(db);
    const adapter = new JiraAdapter({
      baseUrl: project.baseUrl,
      pat: this.store.getDecryptedPat(projectId) ?? '',
      epicLinkFieldId: project.profile.jira?.epicLinkFieldId,
    });
    const service = new ExplorerService(repo, adapter, project, this.config);
    this.cache.set(projectId, { db, service, sig });
    return service;
  }

  /** Default project = the first one (used by MCP when no projectId is given). */
  defaultProjectId(): string | null {
    return this.store.list()[0]?.id ?? null;
  }

  createProject(input: ProjectInput): Project {
    return this.store.create(input);
  }
  updateProject(id: string, input: Partial<ProjectInput>): Project | null {
    const updated = this.store.update(id, input);
    this.cache.get(id)?.db.close();
    this.cache.delete(id); // force rebuild with new connection/profile
    return updated;
  }
  deleteProject(id: string): void {
    this.cache.get(id)?.db.close();
    this.cache.delete(id);
    this.store.delete(id);
  }

  close(): void {
    for (const e of this.cache.values()) e.db.close();
    this.cache.clear();
    this.store.close();
  }
}

function projectSig(p: Project): string {
  return [p.baseUrl, p.hasPat, JSON.stringify(p.scope), JSON.stringify(p.profile)].join('|');
}
