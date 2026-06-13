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
import { api } from './api';

export function App() {
  const qc = useQueryClient();
  const [rootInput, setRootInput] = useState('');
  const [activeRoot, setActiveRoot] = useState<string | null>(null);

  const connection = useQuery({ queryKey: ['connection'], queryFn: api.connection });
  const scope = useQuery({ queryKey: ['scope'], queryFn: api.scope });
  const roots = useQuery({ queryKey: ['roots'], queryFn: api.roots });
  const hierarchy = useQuery({
    queryKey: ['hierarchy', activeRoot],
    queryFn: () => api.hierarchy(activeRoot!),
    enabled: !!activeRoot,
  });

  const sync = useMutation({
    mutationFn: (rootKey: string) => api.sync(rootKey),
    onSuccess: (res) => {
      setActiveRoot(res.rootKey);
      qc.invalidateQueries({ queryKey: ['roots'] });
      qc.invalidateQueries({ queryKey: ['hierarchy', res.rootKey] });
    },
  });

  // open the most recently synced map by default
  useEffect(() => {
    if (!activeRoot && roots.data && roots.data.length > 0) setActiveRoot(roots.data[0]!.rootKey);
  }, [activeRoot, roots.data]);

  const connOk = connection.data?.ok;
  const selected = useMindmap((s) => s.selected);
  const showInspector = !!selected && !!hierarchy.data;

  return (
    <div
      className={`grid h-screen overflow-hidden bg-[#f6f7f9] font-sans text-[#1a1d21] ${
        showInspector ? 'grid-cols-[280px_1fr_340px]' : 'grid-cols-[280px_1fr]'
      }`}
    >
      <aside className="flex flex-col gap-5 overflow-auto border-r border-[#e4e7eb] bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded bg-[#0f766e]" />
          <span className="font-bold tracking-tight">Jira Explorer</span>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Connection</div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${connOk ? 'bg-[#15803d]' : 'bg-[#dc2626]'}`} />
            <span className="font-mono text-xs text-[#5b6573]">
              {connection.isLoading
                ? 'checking…'
                : connOk
                  ? (connection.data?.baseUrl ?? 'connected')
                  : (connection.data?.error ?? 'not configured')}
            </span>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Scope</div>
          <div className="text-xs text-[#5b6573]">projects: {scope.data?.projectKeys.join(', ') || '—'}</div>
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
                  className={`rounded px-2 py-1 text-left font-mono text-xs ${
                    activeRoot === r.rootKey ? 'bg-[#d7efe9] text-[#0f766e]' : 'text-[#5b6573]'
                  }`}
                >
                  {r.rootKey}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main className="relative overflow-hidden">
        {!activeRoot && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-lg font-semibold">Enter a requirement key to map its tree</p>
              <p className="mt-1 text-sm text-[#8b95a3]">Connect Jira, then sync a requirement.</p>
            </div>
          </div>
        )}
        {activeRoot && hierarchy.isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-[#8b95a3]">Loading…</div>
        )}
        {activeRoot && hierarchy.isError && (
          <div className="flex h-full items-center justify-center text-sm text-[#dc2626]">
            {(hierarchy.error as Error).message}
          </div>
        )}
        {hierarchy.data && (
          <div className="absolute inset-0">
            <Mindmap hierarchy={hierarchy.data} />
          </div>
        )}
      </main>

      {showInspector && <Inspector hierarchy={hierarchy.data!} />}
    </div>
  );
}
