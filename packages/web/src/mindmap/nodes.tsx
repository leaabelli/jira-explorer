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

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { deliveryBand, type DeliveryBand } from '@criterio/shared';
import { useMindmap } from './store';
import type { GroupNodeData, NodeData } from './layout';

// Custom React Flow nodes, built to DESIGN.md: hierarchy by size + weight, one teal accent,
// delivery badges, milestone tags, coverage on requirements. Folded toggle on nodes w/ children.

const BAND: Record<DeliveryBand, string> = {
  overdue: 'bg-[#fdecec] text-[#dc2626]',
  soon: 'bg-[#fdf3e3] text-[#b45309]',
  later: 'bg-[#e6f6ec] text-[#15803d]',
};
const TODAY = new Date().toISOString().slice(0, 10);
const STATUS_DOT: Record<string, string> = {
  todo: 'bg-[#8b95a3]',
  in_progress: 'bg-[#0f766e]',
  done: 'bg-[#15803d]',
  unknown: 'bg-[#c7cdd4]',
};

function FoldToggle({ k, hasChildren, expanded }: { k: string; hasChildren: boolean; expanded: boolean }) {
  const toggle = useMindmap((s) => s.toggle);
  if (!hasChildren) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(k);
      }}
      className="absolute -right-2.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#d3d8de] bg-white text-xs text-[#5b6573] shadow-sm"
      title={expanded ? 'collapse' : 'expand'}
    >
      {expanded ? '−' : '+'}
    </button>
  );
}

function selRing(selected: boolean) {
  return selected ? 'ring-2 ring-[#d7efe9] border-[#0f766e]' : '';
}

const handles = (
  <>
    <Handle type="target" position={Position.Left} className="!border-0 !bg-transparent" />
    <Handle type="source" position={Position.Right} className="!border-0 !bg-transparent" />
  </>
);

export function RequirementNode({ data }: NodeProps) {
  const { issue, coverage, hasChildren, expanded } = data as NodeData;
  const selected = useMindmap((s) => s.selected === issue.key);
  return (
    <div
      className={`relative w-[248px] rounded-[13px] border-[1.5px] border-[#d3d8de] bg-white px-4 py-3.5 shadow-[0_6px_24px_rgba(16,24,40,.10)] ${selRing(selected)}`}
    >
      {handles}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b95a3]">Requirement</span>
        <span className="font-mono text-[11px] text-[#0f766e]">{issue.key}</span>
      </div>
      <div className="mb-2 mt-1.5 text-[15px] font-bold leading-tight tracking-tight">{issue.summary}</div>
      {coverage &&
        (coverage.criteriaUnavailable ? (
          <span className="rounded bg-[#f1f3f5] px-2 py-0.5 text-[11px] font-medium text-[#8b95a3]">
            Coverage unavailable
          </span>
        ) : (
          <div>
            <div className="mb-1 flex justify-between text-[12px]">
              <span>
                <b>{coverage.criteriaCount}</b> criteria · {coverage.linkedEpicCount} epics
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-[#eceef1]">
              <div
                className="h-full bg-[#0f766e]"
                style={{ width: coverage.linkedEpicCount > 0 ? '100%' : '0%' }}
              />
            </div>
          </div>
        ))}
      <FoldToggle k={issue.key} hasChildren={hasChildren} expanded={expanded} />
    </div>
  );
}

export function EpicNode({ data }: NodeProps) {
  const { issue, hasChildren, expanded } = data as NodeData;
  const selected = useMindmap((s) => s.selected === issue.key);
  return (
    <div
      className={`relative w-[220px] rounded-[9px] border border-[#e4e7eb] bg-white px-3 py-3 shadow-[0_1px_3px_rgba(16,24,40,.06)] ${selRing(selected)}`}
    >
      {handles}
      {issue.milestoneKeys.map((m) => (
        <span
          key={m}
          className="absolute -top-2 left-3 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm"
        >
          {m}
        </span>
      ))}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8b95a3]">Epic</span>
        <span className="font-mono text-[11px] text-[#0f766e]">{issue.key}</span>
      </div>
      <div className="mb-2.5 mt-1.5 text-[13.5px] font-semibold leading-tight">{issue.summary}</div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e7eb] bg-[#f8f9fb] px-2 py-0.5 text-[11px] font-semibold text-[#5b6573]">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[issue.statusCategory]}`} />
          {issue.status}
        </span>
        {issue.deliveryDate && (
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${BAND[deliveryBand(issue.deliveryDate, TODAY)]}`}>
            {issue.deliveryDate}
          </span>
        )}
        {issue.assignee && (
          <span className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0f766e] text-[10px] font-bold text-white">
            {issue.assignee.initials}
          </span>
        )}
      </div>
      <FoldToggle k={issue.key} hasChildren={hasChildren} expanded={expanded} />
    </div>
  );
}

export function TaskNode({ data }: NodeProps) {
  const { issue } = data as NodeData;
  const selected = useMindmap((s) => s.selected === issue.key);
  return (
    <div
      className={`relative flex w-[176px] items-center gap-2 rounded-md border border-[#e4e7eb] bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(16,24,40,.05)] ${selRing(selected)}`}
    >
      {handles}
      <span className={`h-[7px] w-[7px] flex-none rounded-full ${STATUS_DOT[issue.statusCategory]}`} />
      <span className="truncate text-[12.5px] font-medium text-[#1a1d21]">{issue.summary}</span>
      {issue.assignee && (
        <span className="ml-auto flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#5b6573] text-[9px] font-bold text-white">
          {issue.assignee.initials}
        </span>
      )}
    </div>
  );
}

/** Macro-block container (grouped view): a labeled card that visually holds its epic children. */
export function GroupNode({ data }: NodeProps) {
  const { label, count } = data as GroupNodeData;
  return (
    <div className="relative h-full w-full rounded-2xl border border-[#dfe3e8] bg-[#fbfcfd]/80 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
      <Handle type="target" position={Position.Left} className="!border-0 !bg-transparent" />
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="truncate text-[13px] font-bold tracking-tight text-[#1a1d21]">{label}</span>
        <span className="flex-none rounded-full bg-[#e7ebef] px-2 py-0.5 text-[11px] font-semibold text-[#5b6573]">
          {count} {count === 1 ? 'epic' : 'epics'}
        </span>
      </div>
    </div>
  );
}

export const nodeTypes = {
  requirement: RequirementNode,
  epic: EpicNode,
  task: TaskNode,
  group: GroupNode,
};
