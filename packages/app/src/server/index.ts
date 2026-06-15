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

import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig } from '../config';
import { ProjectStore } from '../db/projects';
import { Workspace } from '../workspace';
import { buildMcpServer } from '../mcp/server';
import { buildRouter } from './routes';

const config = loadConfig();
const store = new ProjectStore(config.dataDir, config.encryptionKey);
const workspace = new Workspace(config.dataDir, store, config);
workspace.seedFromEnv(); // create a "Default" project from JIRA_BASE_URL/PAT on first run

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0', projects: store.list().length });
});

app.use('/api', buildRouter(workspace));

// MCP over Streamable HTTP (stateless). Local LLM clients can also use the stdio entry
// (npm run mcp:stdio). See docs/mcp.md.
app.post('/mcp', async (req, res) => {
  const mcp = buildMcpServer(workspace, config);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void mcp.close();
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'mcp error', code: 'unknown' });
  }
});

// In production the built web app is served from here; in dev, Vite serves it with an /api proxy.
const webDist = fileURLToPath(new URL('../../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('index.html', `file://${webDist}/`))));
}

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[criterio] server listening on http://localhost:${config.port}`);
});
