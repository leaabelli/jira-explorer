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
import { loadConfig } from '../config';

// REST API + (later) serves the built web app and mounts MCP-over-HTTP.
// P0: a health endpoint so we can prove the server boots end to end.
const config = loadConfig();
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '0.1.0',
    jiraConfigured: Boolean(config.jira.baseUrl),
  });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[jira-explorer] server listening on http://localhost:${config.port}`);
});
