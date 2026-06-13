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

import { Router, type Request, type Response } from 'express';
import type { ExplorerService } from '../services';
import { toApiError } from './errors';

// REST surface over ExplorerService. The MCP server (P7) wraps the SAME service, so LLM and UI
// behave identically.
export function buildRouter(service: ExplorerService): Router {
  const r = Router();

  const wrap =
    (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
      Promise.resolve(fn(req, res)).catch((e) => {
        const { status, body } = toApiError(e);
        res.status(status).json(body);
      });
    };

  r.get(
    '/connection',
    wrap(async (_req, res) => res.json(await service.testConnection())),
  );

  r.get('/profile', (_req, res) => res.json(service.getProfile()));
  r.put(
    '/profile',
    wrap((req, res) => res.json(service.setProfile(req.body))),
  );

  r.get('/scope', (_req, res) => res.json(service.getScope()));
  r.put(
    '/scope',
    wrap((req, res) => res.json(service.setScope(req.body))),
  );

  r.get('/roots', (_req, res) => res.json(service.listRoots()));

  r.post(
    '/sync',
    wrap(async (req, res) => {
      const rootKey = String(req.body?.rootKey ?? '').trim();
      if (!rootKey) {
        return res.status(400).json({ error: 'rootKey is required', code: 'validation' });
      }
      return res.json(await service.sync(rootKey));
    }),
  );

  r.get('/hierarchy/:rootKey', (req, res) => {
    const h = service.getHierarchy(req.params.rootKey!);
    if (!h) return res.status(404).json({ error: 'not synced yet', code: 'not_found' });
    return res.json(h);
  });

  r.get('/issue/:key', (req, res) => {
    const i = service.getIssue(req.params.key!);
    if (!i) return res.status(404).json({ error: 'not found', code: 'not_found' });
    return res.json(i);
  });

  r.get('/coverage/:key/drift', (req, res) => res.json(service.coverageDrift(req.params.key!)));

  r.get('/coverage/:key/summary', (req, res) => {
    const summary = service.coverageSummary(req.params.key!);
    if (summary === null) return res.status(404).json({ error: 'not synced', code: 'not_found' });
    return res.type('text/plain').send(summary);
  });

  r.get('/export/:rootKey', (req, res) => {
    const format = req.query.format === 'json' ? 'json' : 'md';
    const out = service.exportContext(req.params.rootKey!, format);
    if (!out) return res.status(404).json({ error: 'not synced', code: 'not_found' });
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    return res.type(out.contentType).send(out.body);
  });

  r.get('/map/:rootKey/html', (req, res) => {
    const html = service.staticHtml(req.params.rootKey!);
    if (html === null) return res.status(404).json({ error: 'not synced', code: 'not_found' });
    return res.type('text/html').send(html);
  });

  r.put(
    '/epic/:key',
    wrap(async (req, res) => {
      await service.updateEpic(req.params.key!, req.body?.patch ?? {}, req.body?.applyToJira);
      return res.json({ ok: true });
    }),
  );

  r.post(
    '/issue/:key/transition',
    wrap(async (req, res) => {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name is required', code: 'validation' });
      await service.transitionIssue(req.params.key!, name);
      return res.json({ ok: true });
    }),
  );

  return r;
}
