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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from './config';
import { encryptSecret, decryptSecret } from './db/crypto';
import { ProjectStore } from './db/projects';
import { Workspace } from './workspace';

const KEY = 'test-secret-key';

describe('crypto', () => {
  it('round-trips', () => {
    const enc = encryptSecret('my-pat-123', KEY);
    expect(enc).not.toContain('my-pat-123');
    expect(decryptSecret(enc, KEY)).toBe('my-pat-123');
  });
  it('fails with the wrong key', () => {
    const enc = encryptSecret('x', KEY);
    expect(() => decryptSecret(enc, 'other')).toThrow();
  });
  it('rejects tampered ciphertext', () => {
    const parts = encryptSecret('secret-value', KEY).split('.');
    parts[2] = (parts[2]![0] === 'A' ? 'B' : 'A') + parts[2]!.slice(1); // corrupt the ciphertext
    expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
  });
});

describe('ProjectStore', () => {
  let dir: string;
  let store: ProjectStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'je-proj-'));
    store = new ProjectStore(dir, KEY);
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a project, never exposing the PAT', () => {
    const p = store.create({ name: 'Acme', baseUrl: 'https://j', pat: 'secret' });
    expect(p.name).toBe('Acme');
    expect(p.hasPat).toBe(true);
    expect(JSON.stringify(p)).not.toContain('secret');
    expect(store.getDecryptedPat(p.id)).toBe('secret');
  });

  it('lists and gets', () => {
    store.create({ name: 'A', baseUrl: '' });
    store.create({ name: 'B', baseUrl: '' });
    expect(store.list().map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('update keeps PAT when omitted, clears on empty, replaces on value', () => {
    const p = store.create({ name: 'A', baseUrl: '', pat: 'one' });
    store.update(p.id, { name: 'A2' });
    expect(store.get(p.id)?.name).toBe('A2');
    expect(store.getDecryptedPat(p.id)).toBe('one'); // kept
    store.update(p.id, { pat: 'two' });
    expect(store.getDecryptedPat(p.id)).toBe('two'); // replaced
    store.update(p.id, { pat: '' });
    expect(store.get(p.id)?.hasPat).toBe(false); // cleared
  });

  it('deletes', () => {
    const p = store.create({ name: 'A', baseUrl: '' });
    store.delete(p.id);
    expect(store.get(p.id)).toBeNull();
  });
});

describe('Workspace', () => {
  let dir: string;
  const config: AppConfig = {
    port: 0,
    dataDir: '',
    encryptionKey: KEY,
    jira: { baseUrl: 'https://seed', pat: 'seedpat' },
    mcp: { allowWrite: true, applyToJira: false },
  };
  let ws: Workspace;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'je-ws-'));
    ws = new Workspace(dir, new ProjectStore(dir, KEY), config);
  });
  afterEach(() => {
    ws.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('seeds a Default project from env when empty', () => {
    ws.seedFromEnv();
    const list = ws.store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Default');
  });

  it('resolves a per-project service bound to its profile/scope', () => {
    const p = ws.createProject({ name: 'A', baseUrl: 'https://j', scope: { projectKeys: ['PLAT'], labels: [] } });
    const svc = ws.getService(p.id)!;
    expect(svc.getScope().projectKeys).toEqual(['PLAT']);
    expect(svc.getProfile().levels).toHaveLength(3);
  });

  it('rebuilds the service after a project update (connection change)', () => {
    const p = ws.createProject({ name: 'A', baseUrl: 'https://one' });
    const s1 = ws.getService(p.id);
    ws.updateProject(p.id, { baseUrl: 'https://two' });
    const s2 = ws.getService(p.id);
    expect(s1).not.toBe(s2); // new instance built
    expect(s2!.project.baseUrl).toBe('https://two');
  });
});
