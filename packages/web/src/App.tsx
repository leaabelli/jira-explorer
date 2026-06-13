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

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deliveryBand,
  type CoverageProxy,
  type HierarchyNode,
  type DeliveryBand,
} from '@jira-explorer/shared';
import { api } from './api';

// P3 UI shell: connection + scope + sync, hierarchy rendered as a LIST to validate data end to
// end. The mindmap canvas (built to DESIGN.md) replaces this list at P4.

const TODAY = new Date().toISOString().slice(0, 10);
const BAND_CLASS: Record<DeliveryBand, string> = {
  overdue: 'bg-[#fdecec] text-[#dc2626]',
  soon: 'bg-[#fdf3e3] text-[#b45309]',
  later: 'bg-[#e6f6ec] text-[#15803d]',
};

function DeliveryBadge({ date }: { date: string }) {
  const band = deliveryBand(date, TODAY);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BAND_CLASS[band]}`}>{date}</span>
  );
}

function CoverageBadge({ cov }: { cov: CoverageProxy }) {
  if (cov.criteriaUnavailable) {
    return (
      <span className="rounded bg-[#f1f3f5] px-2 py-0.5 text-xs font-medium text-[#8b95a3]">
        coverage unavailable
      </span>
    );
  }
  return (
    <span className="rounded bg-[#d7efe9] px-2 py-0.5 text-xs font-semibold text-[#0f766e]">
      {cov.criteriaCount} criteria · {cov.linkedEpicCount} epics linked
    </span>
  );
}

function NodeRow({ node, depth }: { node: HierarchyNode; depth: number }) {
  const { issue } = node;
  return (
    <div>
      <div
        className="flex items-center gap-2 border-b border-[#eef0f2] py-1.5"
        style={{ paddingLeft: depth * 22 + 4 }}
      >
        <span className="font-mono text-xs text-[#0f766e]">{issue.key}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#8b95a3]">
          {issue.level}
        </span>
        <span className="truncate text-sm text-[#1a1d21]">{issue.summary}</span>
        <span className="ml-auto flex items-center gap-2">
          {node.coverage && <CoverageBadge cov={node.coverage} />}
          {issue.deliveryDate && <DeliveryBadge date={issue.deliveryDate} />}
          {issue.milestoneKeys.map((m) => (
            <span key={m} className="rounded-full bg-[#2563eb] px-2 py-0.5 text-[10px] font-bold text-white">
              {m}
            </span>
          ))}
          {issue.assignee && (
            <span className="text-xs text-[#5b6573]">{issue.assignee.initials}</span>
          )}
        </span>
      </div>
      {node.children.map((c) => (
        <NodeRow key={c.issue.key} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

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

  const connOk = connection.data?.ok;

  return (
    <div className="grid min-h-screen grid-cols-[280px_1fr] bg-[#f6f7f9] font-sans text-[#1a1d21]">
      {/* sidebar */}
      <aside className="flex flex-col gap-5 border-r border-[#e4e7eb] bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded bg-[#0f766e]" />
          <span className="font-bold tracking-tight">Jira Explorer</span>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">
            Connection
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${connOk ? 'bg-[#15803d]' : 'bg-[#dc2626]'}`}
            />
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
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">
            Scope
          </div>
          <div className="text-xs text-[#5b6573]">
            projects: {scope.data?.projectKeys.join(', ') || '—'}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">
            Root requirement
          </div>
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
          {sync.isError && (
            <p className="mt-2 text-xs text-[#dc2626]">{(sync.error as Error).message}</p>
          )}
        </div>

        {roots.data && roots.data.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">
              Synced
            </div>
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

      {/* main */}
      <main className="overflow-auto p-6">
        {!activeRoot && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-lg font-semibold">Enter a requirement key to map its tree</p>
              <p className="mt-1 text-sm text-[#8b95a3]">
                P3 shell · the mindmap canvas lands at P4
              </p>
            </div>
          </div>
        )}
        {activeRoot && hierarchy.isLoading && <p className="text-sm text-[#8b95a3]">Loading…</p>}
        {activeRoot && hierarchy.isError && (
          <p className="text-sm text-[#dc2626]">{(hierarchy.error as Error).message}</p>
        )}
        {hierarchy.data && (
          <div className="rounded-lg border border-[#e4e7eb] bg-white p-2">
            <NodeRow node={hierarchy.data.root} depth={0} />
            {hierarchy.data.milestones.length > 0 && (
              <div className="mt-3 border-t border-[#eef0f2] px-2 pt-2 text-xs text-[#5b6573]">
                Milestones:{' '}
                {hierarchy.data.milestones.map((m) => `${m.name}${m.dueDate ? ` (${m.dueDate})` : ''}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
