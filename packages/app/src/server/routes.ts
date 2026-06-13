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
import { projectInputSchema } from '@jira-explorer/shared';
import type { Workspace } from '../workspace';
import type { ExplorerService } from '../services';
import { toApiError } from './errors';

// REST surface. Projects are first-class: /api/projects CRUD, and every data operation is scoped
// to a project at /api/projects/:id/... . The MCP server wraps the SAME per-project services.
export function buildRouter(workspace: Workspace): Router {
  const r = Router();

  const wrap =
    (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
      Promise.resolve(fn(req, res)).catch((e) => {
        const { status, body } = toApiError(e);
        res.status(status).json(body);
      });
    };

  /** Resolve the per-project service, or 404. */
  const svc = (req: Request, res: Response): ExplorerService | null => {
    const s = workspace.getService(req.params.id!);
    if (!s) {
      res.status(404).json({ error: 'project not found', code: 'not_found' });
      return null;
    }
    return s;
  };

  // ── projects ───────────────────────────────────────────────────────────────
  r.get('/projects', (_req, res) => res.json(workspace.store.list()));

  r.post(
    '/projects',
    wrap((req, res) => res.json(workspace.createProject(projectInputSchema.parse(req.body)))),
  );

  r.get('/projects/:id', (req, res) => {
    const p = workspace.store.get(req.params.id!);
    return p ? res.json(p) : res.status(404).json({ error: 'project not found', code: 'not_found' });
  });

  r.put(
    '/projects/:id',
    wrap((req, res) => {
      const updated = workspace.updateProject(
        req.params.id!,
        projectInputSchema.partial().parse(req.body),
      );
      return updated
        ? res.json(updated)
        : res.status(404).json({ error: 'project not found', code: 'not_found' });
    }),
  );

  r.delete('/projects/:id', (req, res) => {
    workspace.deleteProject(req.params.id!);
    return res.json({ ok: true });
  });

  r.get(
    '/projects/:id/connection',
    wrap(async (req, res) => {
      const s = svc(req, res);
      if (s) res.json(await s.testConnection());
    }),
  );

  // ── per-project data ops ─────────────────────────────────────────────────────
  r.get('/projects/:id/roots', (req, res) => {
    const s = svc(req, res);
    if (s) res.json(s.listRoots());
  });

  r.post(
    '/projects/:id/sync',
    wrap(async (req, res) => {
      const s = svc(req, res);
      if (!s) return;
      const rootKey = String(req.body?.rootKey ?? '').trim();
      if (!rootKey) return res.status(400).json({ error: 'rootKey is required', code: 'validation' });
      const result = await s.sync(rootKey);
      workspace.store.setLastSynced(req.params.id!, result.syncedAt);
      return res.json(result);
    }),
  );

  r.get('/projects/:id/hierarchy/:rootKey', (req, res) => {
    const s = svc(req, res);
    if (!s) return;
    const h = s.getHierarchy(req.params.rootKey!);
    return h ? res.json(h) : res.status(404).json({ error: 'not synced yet', code: 'not_found' });
  });

  r.get('/projects/:id/issue/:key', (req, res) => {
    const s = svc(req, res);
    if (!s) return;
    const i = s.getIssue(req.params.key!);
    return i ? res.json(i) : res.status(404).json({ error: 'not found', code: 'not_found' });
  });

  r.get('/projects/:id/coverage/:key/drift', (req, res) => {
    const s = svc(req, res);
    if (s) res.json(s.coverageDrift(req.params.key!));
  });

  r.get('/projects/:id/coverage/:key/summary', (req, res) => {
    const s = svc(req, res);
    if (!s) return;
    const summary = s.coverageSummary(req.params.key!);
    return summary === null
      ? res.status(404).json({ error: 'not synced', code: 'not_found' })
      : res.type('text/plain').send(summary);
  });

  r.put(
    '/projects/:id/epic/:key',
    wrap(async (req, res) => {
      const s = svc(req, res);
      if (!s) return;
      await s.updateEpic(req.params.key!, req.body?.patch ?? {}, req.body?.applyToJira);
      return res.json({ ok: true });
    }),
  );

  r.post(
    '/projects/:id/issue/:key/transition',
    wrap(async (req, res) => {
      const s = svc(req, res);
      if (!s) return;
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: 'name is required', code: 'validation' });
      await s.transitionIssue(req.params.key!, name);
      return res.json({ ok: true });
    }),
  );

  r.get('/projects/:id/export/:rootKey', (req, res) => {
    const s = svc(req, res);
    if (!s) return;
    const format = req.query.format === 'json' ? 'json' : 'md';
    const out = s.exportContext(req.params.rootKey!, format);
    if (!out) return res.status(404).json({ error: 'not synced', code: 'not_found' });
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    return res.type(out.contentType).send(out.body);
  });

  r.get('/projects/:id/map/:rootKey/html', (req, res) => {
    const s = svc(req, res);
    if (!s) return;
    const html = s.staticHtml(req.params.rootKey!);
    return html === null
      ? res.status(404).json({ error: 'not synced', code: 'not_found' })
      : res.type('text/html').send(html);
  });

  return r;
}
