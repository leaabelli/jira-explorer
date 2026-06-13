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

import {
  DEFAULT_PROFILE,
  parseProfile,
  scopeSchema,
  type ConnectionStatus,
  type EpicPatch,
  type Hierarchy,
  type Issue,
  type Profile,
  type Scope,
  type SyncResult,
} from '@jira-explorer/shared';
import type { AppConfig } from './config';
import type { TrackerAdapter } from './core/adapter';
import { CacheRepo, type CoverageSnapshot } from './db/repositories';
import type { DB } from './db/sqlite';
import { JiraAdapter } from './jira/adapter';
import { syncRoot } from './sync/engine';
import { buildHierarchy } from './sync/hierarchy';
import { toContextMarkdown, toCoverageSummary, toJsonExport, toStaticHtml } from './export';

// The single engine API that BOTH the REST server and the MCP server wrap, so an LLM's
// reads/writes behave identically to the UI's. Profile + scope persist in the settings table
// (editable from the UI / MCP); connection comes from env in v1.

const KEY_PROFILE = 'profile';
const KEY_SCOPE = 'scope';

export class ExplorerService {
  constructor(
    readonly repo: CacheRepo,
    private readonly adapter: TrackerAdapter,
    private readonly config: AppConfig,
  ) {}

  static fromConfig(config: AppConfig, db: DB): ExplorerService {
    const adapter = new JiraAdapter({
      baseUrl: config.jira.baseUrl ?? '',
      pat: config.jira.pat ?? '',
    });
    return new ExplorerService(new CacheRepo(db), adapter, config);
  }

  // --- config (profile + scope) ---
  getProfile(): Profile {
    const stored = this.repo.getSetting<unknown>(KEY_PROFILE);
    return stored ? parseProfile(stored) : DEFAULT_PROFILE;
  }
  setProfile(input: unknown): Profile {
    const profile = parseProfile(input);
    this.repo.setSetting(KEY_PROFILE, profile);
    return profile;
  }
  getScope(): Scope {
    const stored = this.repo.getSetting<unknown>(KEY_SCOPE);
    if (stored) return scopeSchema.parse(stored);
    return scopeSchema.parse({
      projectKeys: (process.env.JIRA_PROJECT_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      labels: (process.env.JIRA_LABELS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      extraJql: process.env.JIRA_EXTRA_JQL || undefined,
    });
  }
  setScope(input: unknown): Scope {
    const scope = scopeSchema.parse(input);
    this.repo.setSetting(KEY_SCOPE, scope);
    return scope;
  }

  // --- reads ---
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

  // --- export (req #6) + E3/E4 ---
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

  // --- writes ---
  sync(rootKey: string): Promise<SyncResult> {
    return syncRoot(rootKey, this.getProfile(), this.getScope(), {
      adapter: this.adapter,
      repo: this.repo,
    });
  }

  /**
   * Edit an epic. `applyToJira` defaults to the config flag; when true the change is written to
   * the real tracker first, then the cache is updated to match (UI reflects it immediately).
   */
  async updateEpic(key: string, patch: EpicPatch, applyToJira = this.config.mcp.applyToJira): Promise<void> {
    if (applyToJira) await this.adapter.updateEpic(key, patch);
    this.repo.applyEpicPatch(key, patch);
  }

  transitionIssue(key: string, transitionName: string): Promise<void> {
    return this.adapter.transitionIssue(key, transitionName);
  }
}
