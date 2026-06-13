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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../config';
import { ProjectStore } from '../db/projects';
import { Workspace } from '../workspace';
import { buildMcpServer } from './server';

// MCP server over stdio, for local LLM clients (Claude Desktop / Claude Code). Logs go to stderr;
// stdout carries the MCP protocol. See docs/mcp.md.
const config = loadConfig();
const store = new ProjectStore(config.dataDir, config.encryptionKey);
const workspace = new Workspace(config.dataDir, store, config);
workspace.seedFromEnv();

const server = buildMcpServer(workspace, config);
await server.connect(new StdioServerTransport());
// eslint-disable-next-line no-console
console.error('[jira-explorer] MCP stdio server ready');
