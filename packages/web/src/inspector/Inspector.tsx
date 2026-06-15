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
import type { EpicPatch, Hierarchy, Issue } from '@criterio/shared';
import { api } from '../api';
import { useMindmap } from '../mindmap/store';

// Right-drawer inspector (DESIGN.md / D3). Read-only details for any node; an editable form +
// "Save to Jira" write-back (req #9) for epics. Coverage drift (E2) on requirements. Scoped to the
// active project.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">{label}</div>
      {children}
    </div>
  );
}

function EpicEditor({ projectId, issue }: { projectId: string; issue: Issue }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState(issue.summary);
  const [deliveryDate, setDeliveryDate] = useState(issue.deliveryDate ?? '');
  const [description, setDescription] = useState(issue.description ?? '');
  const [labels, setLabels] = useState(issue.labels.join(', '));

  useEffect(() => {
    setSummary(issue.summary);
    setDeliveryDate(issue.deliveryDate ?? '');
    setDescription(issue.description ?? '');
    setLabels(issue.labels.join(', '));
  }, [issue]);

  // Staged: save locally, mark pending. The "Push to Jira" button in the top bar flushes all edits.
  const save = useMutation({
    mutationFn: () => {
      const patch: EpicPatch = {
        summary,
        description,
        deliveryDate: deliveryDate || undefined,
        labels: labels.split(',').map((s) => s.trim()).filter(Boolean),
      };
      return api.updateEpic(projectId, issue.key, patch, false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hierarchy', projectId] });
      qc.invalidateQueries({ queryKey: ['pending', projectId] });
    },
  });

  const fld = 'h-8 w-full rounded border border-[#d3d8de] px-2 text-sm outline-none focus:border-[#0f766e]';
  return (
    <div className="flex flex-col gap-4">
      <Field label="Summary"><input className={fld} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <Field label="Delivery date"><input type="date" className={fld} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded border border-[#d3d8de] p-2 text-sm outline-none focus:border-[#0f766e]" />
      </Field>
      <Field label="Labels (comma separated)"><input className={fld} value={labels} onChange={(e) => setLabels(e.target.value)} /></Field>
      <button disabled={save.isPending} onClick={() => save.mutate()} className="h-8 rounded bg-[#0f766e] text-sm font-semibold text-white disabled:opacity-50">
        {save.isPending ? 'Saving…' : 'Save change'}
      </button>
      {save.isError && <p className="text-xs text-[#dc2626]">{(save.error as Error).message}</p>}
      {save.isSuccess && <p className="text-xs text-[#15803d]">Saved locally — staged for Jira. Use “Push” in the top bar to send it.</p>}
    </div>
  );
}

/** Collapsed dump of every untouched tracker field (full fidelity), for power users + parity with the LLM export. */
function AllFields({ issue }: { issue: Issue }) {
  const raw = issue.raw;
  if (!raw || Object.keys(raw).length === 0) return null;
  const entries = Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <details className="border-t border-[#eceef1] pt-3">
      <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">
        All fields ({entries.length})
      </summary>
      <dl className="mt-2 flex flex-col gap-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[100px_1fr] gap-2">
            <dt className="truncate font-mono text-[10px] text-[#8b95a3]" title={k}>{k}</dt>
            <dd className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[#5b6573]">
              {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function RequirementDrift({ projectId, requirementKey }: { projectId: string; requirementKey: string }) {
  const drift = useQuery({
    queryKey: ['drift', projectId, requirementKey],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/coverage/${encodeURIComponent(requirementKey)}/drift`);
      return (await r.json()) as Array<{ syncedAt: string; criteriaCount: number; linkedEpicCount: number }>;
    },
  });
  if (!drift.data || drift.data.length < 2) return null;
  const [now, prev] = drift.data;
  if (!now || !prev || now.linkedEpicCount === prev.linkedEpicCount) return null;
  const down = now.linkedEpicCount < prev.linkedEpicCount;
  return (
    <p className={`text-xs ${down ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>
      Linked epics {prev.linkedEpicCount} → {now.linkedEpicCount} since last sync
    </p>
  );
}

export function Inspector({ projectId, hierarchy }: { projectId: string; hierarchy: Hierarchy }) {
  const selected = useMindmap((s) => s.selected);
  const select = useMindmap((s) => s.select);
  if (!selected) return null;
  const issue = hierarchy.issuesByKey[selected];
  if (!issue) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[340px] flex-col gap-4 overflow-auto border-l border-[#e4e7eb] bg-white p-4 shadow-2xl lg:static lg:z-auto lg:w-auto lg:shadow-none">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[#0f766e]">{issue.key}</span>
        <button onClick={() => select(null)} className="text-sm text-[#8b95a3] hover:text-[#1a1d21]">✕</button>
      </div>
      <div className="text-base font-bold leading-tight tracking-tight">{issue.summary}</div>
      <div className="flex flex-wrap gap-2 text-xs text-[#5b6573]">
        <span className="rounded-full bg-[#f8f9fb] px-2 py-0.5">{issue.level}</span>
        <span className="rounded-full bg-[#f8f9fb] px-2 py-0.5">{issue.status}</span>
        {issue.assignee && <span className="rounded-full bg-[#f8f9fb] px-2 py-0.5">{issue.assignee.displayName}</span>}
      </div>

      {issue.level === 'requirement' && (
        <>
          <RequirementDrift projectId={projectId} requirementKey={issue.key} />
          {issue.acceptanceCriteria.length > 0 && (
            <Field label="Acceptance criteria">
              <ul className="list-disc pl-4 text-sm text-[#5b6573]">
                {issue.acceptanceCriteria.map((c) => (<li key={c.id}>{c.text}</li>))}
              </ul>
            </Field>
          )}
        </>
      )}

      {issue.level === 'epic' && <EpicEditor projectId={projectId} issue={issue} />}

      {issue.level === 'task' && issue.description && (
        <Field label="Description"><p className="whitespace-pre-wrap text-sm text-[#5b6573]">{issue.description}</p></Field>
      )}

      <AllFields issue={issue} />
    </aside>
  );
}
