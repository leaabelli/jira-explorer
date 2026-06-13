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
  Scope,
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

export const api = {
  connection: () => req<ConnectionStatus>('/connection'),
  scope: () => req<Scope>('/scope'),
  roots: () => req<Array<{ rootKey: string; syncedAt: string }>>('/roots'),
  hierarchy: (rootKey: string) => req<Hierarchy>(`/hierarchy/${encodeURIComponent(rootKey)}`),
  issue: (key: string) => req<Issue>(`/issue/${encodeURIComponent(key)}`),
  sync: (rootKey: string) => req<SyncResult>('/sync', { method: 'POST', body: JSON.stringify({ rootKey }) }),
  updateEpic: (key: string, patch: EpicPatch, applyToJira?: boolean) =>
    req<{ ok: true }>(`/epic/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ patch, applyToJira }),
    }),
};
