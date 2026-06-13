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

// @jira-explorer/app — the node-only engine plus its REST + MCP adapters.
//
// Internal folders (filled in from P1 onward):
//   core/      domain types glue + the TrackerAdapter interface (the tracker-agnostic seam)
//   jira/      Jira Data Center adapter (REST v2 + PAT) — first TrackerAdapter impl
//   db/        SQLite cache (better-sqlite3) + migrations + repositories
//   sync/      root-down batched-JQL sync + hierarchy builder
//   coverage/  deterministic proxy now, AI-verified later
//   export/    JSON + LLM-markdown context pack
//   server/    Express REST API + serves the web app + MCP-over-HTTP
//   mcp/       MCP server definition (domain tools) + stdio entry
//
// The REST server and the MCP server are thin adapters over this engine, so an LLM's
// reads/writes behave identically to the UI's.

export { loadConfig, type AppConfig } from './config';
export { ExplorerService } from './services';
export { Workspace } from './workspace';
export { openDb, openCacheDb, createDb, type DB } from './db/sqlite';
export { CacheRepo } from './db/repositories';
export { ProjectStore } from './db/projects';
export { encryptSecret, decryptSecret } from './db/crypto';
export { JiraAdapter } from './jira/adapter';
export type { TrackerAdapter } from './core/adapter';
export { syncRoot, RootNotFoundError } from './sync/engine';
export { buildHierarchy } from './sync/hierarchy';

export const APP_VERSION = '0.1.0';
