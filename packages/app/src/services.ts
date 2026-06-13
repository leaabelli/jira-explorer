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
  Hierarchy,
  Issue,
  Profile,
  Project,
  Scope,
  SyncResult,
} from '@jira-explorer/shared';
import type { AppConfig } from './config';
import type { TrackerAdapter } from './core/adapter';
import { CacheRepo, type CoverageSnapshot } from './db/repositories';
import { syncRoot } from './sync/engine';
import { buildHierarchy } from './sync/hierarchy';
import { toContextMarkdown, toCoverageSummary, toJsonExport, toStaticHtml } from './export';

// The engine API for ONE project: bound to that project's cache (repo), connection (adapter), and
// profile/scope. Both the REST server and the MCP server resolve a per-project ExplorerService via
// the Workspace, so an LLM's reads/writes behave identically to the UI's.
export class ExplorerService {
  constructor(
    readonly repo: CacheRepo,
    private readonly adapter: TrackerAdapter,
    readonly project: Project,
    private readonly config: AppConfig,
  ) {}

  getProfile(): Profile {
    return this.project.profile;
  }
  getScope(): Scope {
    return this.project.scope;
  }

  testConnection(): Promise<ConnectionStatus> {
    return this.adapter.testConnection();
  }
  getHierarchy(rootKey: string): Hierarchy | null {
    const tree = this.repo.getTree(rootKey);
    return tree ? buildHierarchy(rootKey, tree) : null;
  }
  getIssue(key: string): Issue | null {
    return this.repo.getIssue(key);
  }
  listRoots(): Array<{ rootKey: string; syncedAt: string }> {
    return this.repo.listRoots();
  }
  coverageDrift(requirementKey: string): CoverageSnapshot[] {
    return this.repo.coverageHistory(requirementKey);
  }

  sync(rootKey: string): Promise<SyncResult> {
    return syncRoot(rootKey, this.project.profile, this.project.scope, {
      adapter: this.adapter,
      repo: this.repo,
    });
  }

  async updateEpic(
    key: string,
    patch: EpicPatch,
    applyToJira = this.config.mcp.applyToJira,
  ): Promise<void> {
    if (applyToJira) await this.adapter.updateEpic(key, patch);
    this.repo.applyEpicPatch(key, patch);
  }

  transitionIssue(key: string, transitionName: string): Promise<void> {
    return this.adapter.transitionIssue(key, transitionName);
  }

  // export (req #6) + E3/E4
  exportContext(
    rootKey: string,
    format: 'md' | 'json',
  ): { body: string; contentType: string; filename: string } | null {
    const h = this.getHierarchy(rootKey);
    if (!h) return null;
    if (format === 'json') {
      return {
        body: JSON.stringify(toJsonExport(h), null, 2),
        contentType: 'application/json',
        filename: `${rootKey}.json`,
      };
    }
    return { body: toContextMarkdown(h), contentType: 'text/markdown', filename: `${rootKey}.md` };
  }
  coverageSummary(rootKey: string): string | null {
    const h = this.getHierarchy(rootKey);
    return h ? toCoverageSummary(h) : null;
  }
  staticHtml(rootKey: string): string | null {
    const h = this.getHierarchy(rootKey);
    return h ? toStaticHtml(h) : null;
  }
}
