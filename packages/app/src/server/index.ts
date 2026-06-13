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
import { loadConfig } from '../config';
import { openDb } from '../db/sqlite';
import { ExplorerService } from '../services';
import { buildRouter } from './routes';

const config = loadConfig();
const db = openDb(config.dataDir);
const service = ExplorerService.fromConfig(config, db);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0', jiraConfigured: Boolean(config.jira.baseUrl) });
});

app.use('/api', buildRouter(service));

// In production the built web app is served from here; in dev, Vite serves it with an /api proxy.
const webDist = fileURLToPath(new URL('../../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('index.html', `file://${webDist}/`))));
}

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[jira-explorer] server listening on http://localhost:${config.port}`);
});
