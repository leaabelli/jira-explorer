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
import { Mindmap } from './mindmap/Mindmap';
import { Inspector } from './inspector/Inspector';
import { useMindmap } from './mindmap/store';
import { ProjectSettings } from './components/ProjectSettings';
import { api } from './api';

function ExportPanel({ projectId, rootKey }: { projectId: string; rootKey: string }) {
  const [copied, setCopied] = useState(false);
  const open = (path: string) => window.open(path, '_blank');
  const copy = async () => {
    const text = await api.coverageSummary(projectId, rootKey);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy the coverage summary:', text);
    }
  };
  const btn = 'rounded border border-[#d3d8de] bg-white px-2 py-1 text-left text-xs font-medium text-[#1a1d21] hover:bg-[#f8f9fb]';
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Export</div>
      <div className="flex flex-col gap-1.5">
        <button className={btn} onClick={() => open(api.exportUrl(projectId, rootKey, 'md'))}>Export for LLM (.md)</button>
        <button className={btn} onClick={() => open(api.exportUrl(projectId, rootKey, 'json'))}>Export JSON</button>
        <button className={btn} onClick={() => open(api.mapUrl(projectId, rootKey))}>Open HTML map</button>
        <button className={btn} onClick={copy}>{copied ? 'Copied ✓' : 'Copy coverage summary'}</button>
      </div>
    </div>
  );
}

export function App() {
  const qc = useQueryClient();
  const select = useMindmap((s) => s.select);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [rootInput, setRootInput] = useState('');
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ id: string | null } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });

  // pick the first project by default
  useEffect(() => {
    if (!activeProjectId && projects.data && projects.data.length > 0) {
      setActiveProjectId(projects.data[0]!.id);
    }
  }, [activeProjectId, projects.data]);

  const pid = activeProjectId;
  const activeProject = projects.data?.find((p) => p.id === pid);

  const connection = useQuery({
    queryKey: ['connection', pid],
    queryFn: () => api.projects.connection(pid!),
    enabled: !!pid,
  });
  const roots = useQuery({ queryKey: ['roots', pid], queryFn: () => api.roots(pid!), enabled: !!pid });
  const hierarchy = useQuery({
    queryKey: ['hierarchy', pid, activeRoot],
    queryFn: () => api.hierarchy(pid!, activeRoot!),
    enabled: !!pid && !!activeRoot,
  });

  const sync = useMutation({
    mutationFn: (rootKey: string) => api.sync(pid!, rootKey),
    onSuccess: (res) => {
      setActiveRoot(res.rootKey);
      qc.invalidateQueries({ queryKey: ['roots', pid] });
      qc.invalidateQueries({ queryKey: ['hierarchy', pid, res.rootKey] });
    },
  });

  // reset view when switching project
  useEffect(() => {
    setActiveRoot(null);
    select(null);
  }, [pid, select]);

  useEffect(() => {
    if (!activeRoot && roots.data && roots.data.length > 0) setActiveRoot(roots.data[0]!.rootKey);
  }, [activeRoot, roots.data]);

  const connOk = connection.data?.ok;
  const selected = useMindmap((s) => s.selected);
  const showInspector = !!selected && !!hierarchy.data;
  const noProjects = projects.data && projects.data.length === 0;

  return (
    <div className={`relative h-screen overflow-hidden bg-[#f6f7f9] font-sans text-[#1a1d21] lg:grid ${showInspector ? 'lg:grid-cols-[280px_1fr_340px]' : 'lg:grid-cols-[280px_1fr]'}`}>
      {/* mobile menu button + backdrop */}
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-3 z-30 rounded-lg border border-[#e4e7eb] bg-white px-3 py-1.5 text-sm shadow lg:hidden"
      >
        ☰
      </button>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/30 lg:hidden" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] transform flex-col gap-5 overflow-auto border-r border-[#e4e7eb] bg-white p-4 transition-transform lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded bg-[#0f766e]" />
            <span className="font-bold tracking-tight">Jira Explorer</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-[#8b95a3] lg:hidden" aria-label="Close menu">✕</button>
        </div>

        {/* project switcher */}
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Project</div>
          <div className="flex gap-1.5">
            <select
              value={pid ?? ''}
              onChange={(e) => setActiveProjectId(e.target.value || null)}
              className="h-8 flex-1 rounded border border-[#d3d8de] px-2 text-sm outline-none focus:border-[#0f766e]"
            >
              {(projects.data ?? []).length === 0 && <option value="">No projects</option>}
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {pid && (
              <button onClick={() => setSettings({ id: pid })} title="Project settings" className="h-8 w-8 rounded border border-[#d3d8de] text-[#5b6573]">⚙</button>
            )}
            <button onClick={() => setSettings({ id: null })} title="New project" className="h-8 w-8 rounded border border-[#d3d8de] text-[#5b6573]">+</button>
          </div>
        </div>

        {pid && (
          <>
            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Connection</div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${connOk ? 'bg-[#15803d]' : 'bg-[#dc2626]'}`} />
                <span className="font-mono text-xs text-[#5b6573]">
                  {connection.isLoading ? 'checking…' : connOk ? (connection.data?.baseUrl ?? 'connected') : (connection.data?.error ?? 'not configured')}
                </span>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Scope</div>
              <div className="text-xs text-[#5b6573]">projects: {activeProject?.scope.projectKeys.join(', ') || '—'}</div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Root requirement</div>
              <input
                value={rootInput}
                onChange={(e) => setRootInput(e.target.value.toUpperCase())}
                placeholder="PLAT-1042"
                className="mb-2 h-8 w-full rounded border border-[#d3d8de] px-2 font-mono text-sm outline-none focus:border-[#0f766e]"
              />
              <button
                disabled={!rootInput || sync.isPending}
                onClick={() => sync.mutate(rootInput)}
                className="h-8 w-full rounded bg-[#0f766e] text-sm font-semibold text-white disabled:opacity-50"
              >
                {sync.isPending ? 'Syncing…' : 'Sync this tree'}
              </button>
              {sync.isError && <p className="mt-2 text-xs text-[#dc2626]">{(sync.error as Error).message}</p>}
            </div>

            {roots.data && roots.data.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Synced</div>
                <div className="flex flex-col gap-1">
                  {roots.data.map((r) => (
                    <button
                      key={r.rootKey}
                      onClick={() => setActiveRoot(r.rootKey)}
                      className={`rounded px-2 py-1 text-left font-mono text-xs ${activeRoot === r.rootKey ? 'bg-[#d7efe9] text-[#0f766e]' : 'text-[#5b6573]'}`}
                    >
                      {r.rootKey}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pid && activeRoot && <ExportPanel projectId={pid} rootKey={activeRoot} />}
          </>
        )}
      </aside>

      <main className="relative h-full overflow-hidden">
        {noProjects && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-lg font-semibold">Create your first project</p>
              <p className="mb-4 mt-1 text-sm text-[#8b95a3]">A project is one saved Jira exploration: connection + scope + profile.</p>
              <button onClick={() => setSettings({ id: null })} className="h-9 rounded bg-[#0f766e] px-4 text-sm font-semibold text-white">New project</button>
            </div>
          </div>
        )}
        {pid && !activeRoot && !noProjects && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-lg font-semibold">Enter a requirement key to map its tree</p>
              <p className="mt-1 text-sm text-[#8b95a3]">Configure the connection in project settings (⚙), then sync.</p>
            </div>
          </div>
        )}
        {pid && activeRoot && hierarchy.isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-[#8b95a3]">Loading…</div>
        )}
        {pid && activeRoot && hierarchy.isError && (
          <div className="flex h-full items-center justify-center text-sm text-[#dc2626]">{(hierarchy.error as Error).message}</div>
        )}
        {hierarchy.data && (
          <div className="absolute inset-0">
            <Mindmap hierarchy={hierarchy.data} />
          </div>
        )}
      </main>

      {showInspector && pid && <Inspector projectId={pid} hierarchy={hierarchy.data!} />}

      {settings && (
        <ProjectSettings
          projectId={settings.id}
          onClose={() => setSettings(null)}
          onSaved={(p) => {
            setActiveProjectId(p.id);
            setSettings(null);
          }}
        />
      )}
    </div>
  );
}
