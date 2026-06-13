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
  Project,
  SyncResult,
} from '@jira-explorer/shared';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as T;
}

export interface ProjectInputBody {
  name: string;
  baseUrl?: string;
  pat?: string;
  scope?: unknown;
  profile?: unknown;
}

const p = (id: string) => `/projects/${encodeURIComponent(id)}`;

export const api = {
  projects: {
    list: () => req<Project[]>('/projects'),
    get: (id: string) => req<Project>(p(id)),
    create: (body: ProjectInputBody) => req<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<ProjectInputBody>) =>
      req<Project>(p(id), { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => req<{ ok: true }>(p(id), { method: 'DELETE' }),
    connection: (id: string) => req<ConnectionStatus>(`${p(id)}/connection`),
  },
  roots: (id: string) => req<Array<{ rootKey: string; syncedAt: string }>>(`${p(id)}/roots`),
  hierarchy: (id: string, rootKey: string) =>
    req<Hierarchy>(`${p(id)}/hierarchy/${encodeURIComponent(rootKey)}`),
  issue: (id: string, key: string) => req<Issue>(`${p(id)}/issue/${encodeURIComponent(key)}`),
  sync: (id: string, rootKey: string) =>
    req<SyncResult>(`${p(id)}/sync`, { method: 'POST', body: JSON.stringify({ rootKey }) }),
  updateEpic: (id: string, key: string, patch: EpicPatch, applyToJira?: boolean) =>
    req<{ ok: true }>(`${p(id)}/epic/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ patch, applyToJira }),
    }),
  coverageSummary: (id: string, key: string) =>
    fetch(`/api${p(id)}/coverage/${encodeURIComponent(key)}/summary`).then((r) => r.text()),
  exportUrl: (id: string, rootKey: string, format: 'md' | 'json') =>
    `/api${p(id)}/export/${encodeURIComponent(rootKey)}?format=${format}`,
  mapUrl: (id: string, rootKey: string) => `/api${p(id)}/map/${encodeURIComponent(rootKey)}/html`,
};
