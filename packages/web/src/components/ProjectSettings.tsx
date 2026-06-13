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

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PROFILE, type ConnectionStatus, type Project } from '@jira-explorer/shared';
import { api, type ProjectInputBody } from '../api';

// Modal to create/edit a project: connection (name, base URL, PAT, test), scope, and the profile
// (JSON). Replaces .env-driven config (the everyday knobs are structured; the full Profile mapping
// is an advanced JSON field — see docs/sample-profile.json).

const label = 'mb-1 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]';
const input = 'h-9 w-full rounded border border-[#d3d8de] px-2.5 text-sm outline-none focus:border-[#0f766e]';

export function ProjectSettings({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string | null; // null = create
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const qc = useQueryClient();
  const editing = !!projectId;
  const existing = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: editing,
  });

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [pat, setPat] = useState('');
  const [projectKeys, setProjectKeys] = useState('');
  const [labels, setLabels] = useState('');
  const [extraJql, setExtraJql] = useState('');
  const [profileText, setProfileText] = useState(JSON.stringify(DEFAULT_PROFILE, null, 2));
  const [savedId, setSavedId] = useState<string | null>(projectId);
  const [testResult, setTestResult] = useState<ConnectionStatus | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    const pr = existing.data;
    if (!pr) return;
    setName(pr.name);
    setBaseUrl(pr.baseUrl);
    setProjectKeys(pr.scope.projectKeys.join(', '));
    setLabels(pr.scope.labels.join(', '));
    setExtraJql(pr.scope.extraJql ?? '');
    setProfileText(JSON.stringify(pr.profile, null, 2));
    setSavedId(pr.id);
  }, [existing.data]);

  const body = (): ProjectInputBody | null => {
    let profile: unknown;
    try {
      profile = JSON.parse(profileText);
      setJsonError(null);
    } catch (e) {
      setJsonError(`Profile JSON: ${(e as Error).message}`);
      return null;
    }
    const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    return {
      name,
      baseUrl,
      ...(pat ? { pat } : {}), // empty = keep existing
      scope: { projectKeys: csv(projectKeys), labels: csv(labels), extraJql: extraJql || undefined },
      profile,
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const b = body();
      if (!b) throw new Error(jsonError ?? 'invalid input');
      return editing ? api.projects.update(savedId!, b) : api.projects.create(b);
    },
    onSuccess: (proj) => {
      setSavedId(proj.id);
      setPat('');
      qc.invalidateQueries({ queryKey: ['projects'] });
      onSaved(proj);
    },
  });

  const test = useMutation({
    mutationFn: () => api.projects.connection(savedId!),
    onSuccess: (r) => setTestResult(r),
  });

  const del = useMutation({
    mutationFn: () => api.projects.remove(savedId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-[560px] flex-col gap-4 overflow-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{editing ? 'Project settings' : 'New project'}</h2>
          <button onClick={onClose} className="text-[#8b95a3] hover:text-[#1a1d21]">✕</button>
        </div>

        <div>
          <div className={label}>Name</div>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments team" />
        </div>

        <div className="rounded-lg border border-[#e4e7eb] p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Connection (Jira Data Center)</div>
          <div className="mb-2">
            <div className={label}>Base URL</div>
            <input className={input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://jira.your-company.com" />
          </div>
          <div className="mb-2">
            <div className={label}>Personal Access Token</div>
            <input
              type="password"
              className={input}
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder={existing.data?.hasPat ? '•••••••• (unchanged)' : 'paste your PAT'}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={!savedId || test.isPending}
              onClick={() => test.mutate()}
              className="h-8 rounded border border-[#d3d8de] bg-white px-3 text-xs font-semibold text-[#1a1d21] disabled:opacity-50"
              title={savedId ? '' : 'Save first'}
            >
              {test.isPending ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && (
              <span className={`text-xs ${testResult.ok ? 'text-[#15803d]' : 'text-[#dc2626]'}`}>
                {testResult.ok ? `OK — ${testResult.user}` : testResult.error}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#e4e7eb] p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Scope</div>
          <div className="mb-2">
            <div className={label}>Project keys (comma)</div>
            <input className={input} value={projectKeys} onChange={(e) => setProjectKeys(e.target.value)} placeholder="PLAT, BILLING" />
          </div>
          <div className="mb-2">
            <div className={label}>Labels (comma)</div>
            <input className={input} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="team-payments" />
          </div>
          <div>
            <div className={label}>Extra JQL (optional)</div>
            <input className={input} value={extraJql} onChange={(e) => setExtraJql(e.target.value)} placeholder='fixVersion = "2026.Q3"' />
          </div>
        </div>

        <div>
          <div className={label}>Profile (advanced — maps Requirement/Epic/Task to your Jira)</div>
          <p className="mb-1 text-[11px] text-[#8b95a3]">
            The key setting is each level's <code>acceptanceCriteria</code> source. See docs/sample-profile.json.
          </p>
          <textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            rows={8}
            className="w-full rounded border border-[#d3d8de] p-2 font-mono text-xs outline-none focus:border-[#0f766e]"
          />
          {jsonError && <p className="mt-1 text-xs text-[#dc2626]">{jsonError}</p>}
        </div>

        {save.isError && <p className="text-xs text-[#dc2626]">{(save.error as Error).message}</p>}

        <div className="flex items-center gap-2">
          <button
            disabled={!name || save.isPending}
            onClick={() => save.mutate()}
            className="h-9 flex-1 rounded bg-[#0f766e] text-sm font-semibold text-white disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
          </button>
          {editing && (
            <button
              onClick={() => del.mutate()}
              className="h-9 rounded border border-[#dc2626] px-3 text-sm font-semibold text-[#dc2626]"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
