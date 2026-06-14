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

import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Hierarchy, HierarchyNode } from '@jira-explorer/shared';
import { allExpandableKeys, layoutHierarchy } from './layout';
import { nodeTypes } from './nodes';
import { useMindmap } from './store';
import { dirForKey, navigate } from './navigation';

function Legend({ milestones }: { milestones: Hierarchy['milestones'] }) {
  return (
    <Panel position="top-right">
      <div className="rounded-lg border border-[#e4e7eb] bg-white p-3 text-[12px] shadow-[0_6px_24px_rgba(16,24,40,.10)]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Delivery</div>
        <div className="mb-1 flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#dc2626]" /> Overdue</div>
        <div className="mb-1 flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#b45309]" /> Due ≤ 30 days</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-[#15803d]" /> Later</div>
        {milestones.length > 0 && (
          <>
            <div className="mb-2 mt-2.5 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]">Milestones</div>
            {milestones.map((m) => (
              <div key={m.key} className="mb-1 flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-[#2563eb]" /> {m.name}
                {m.dueDate ? ` · ${m.dueDate}` : ''}
              </div>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}

// Accessible fallback: a real role=tree mirror of the hierarchy, usable with Tab/Enter and
// screen readers (a pure-canvas graph is invisible to AT — T-A11Y).
function TreeItem({ node, depth }: { node: HierarchyNode; depth: number }) {
  const select = useMindmap((s) => s.select);
  const selected = useMindmap((s) => s.selected === node.issue.key);
  const has = node.children.length > 0;
  const i = node.issue;
  const meta = [
    i.deliveryDate,
    node.coverage && !node.coverage.criteriaUnavailable
      ? `${node.coverage.criteriaCount} criteria · ${node.coverage.linkedEpicCount} epics`
      : null,
  ].filter(Boolean).join(' · ');
  return (
    <li role="treeitem" aria-expanded={has ? true : undefined} aria-selected={selected}>
      <button
        onClick={() => select(node.issue.key)}
        style={{ paddingLeft: depth * 18 + 8 }}
        className={`flex w-full items-center gap-2 rounded py-1.5 text-left text-sm hover:bg-[#f1f3f5] ${selected ? 'bg-[#d7efe9]' : ''}`}
      >
        <span className="font-mono text-xs text-[#0f766e]">{i.key}</span>
        <span className="text-[10px] font-bold uppercase text-[#8b95a3]">{i.level}</span>
        <span className="truncate">{i.summary}</span>
        {meta && <span className="ml-auto pr-2 text-xs text-[#8b95a3]">{meta}</span>}
      </button>
      {has && (
        <ul role="group">
          {node.children.map((c) => (
            <TreeItem key={c.issue.key} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Canvas({ hierarchy }: { hierarchy: Hierarchy }) {
  const expanded = useMindmap((s) => s.expanded);
  const setExpanded = useMindmap((s) => s.setExpanded);
  const select = useMindmap((s) => s.select);
  const selected = useMindmap((s) => s.selected);
  const rootKey = hierarchy.root.issue.key;
  const [listView, setListView] = useState(false);
  const rf = useReactFlow();

  useEffect(() => {
    setExpanded(allExpandableKeys(hierarchy.root));
  }, [rootKey, setExpanded, hierarchy.root]);

  const { nodes, edges } = useMemo(
    () => layoutHierarchy(hierarchy.root, expanded),
    [hierarchy, expanded],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return select(null);
    const dir = dirForKey(e.key);
    if (!dir) return;
    e.preventDefault();
    const next = navigate(hierarchy, selected, dir);
    if (!next) return;
    select(next);
    const n = rf.getNode(next);
    if (n) rf.setCenter(n.position.x + 110, n.position.y + 40, { zoom: rf.getZoom(), duration: 200 });
  };

  const Toggle = (
    <Panel position="top-left">
      <button
        onClick={() => setListView((v) => !v)}
        className="rounded-lg border border-[#e4e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1d21] shadow-sm"
        aria-pressed={listView}
      >
        {listView ? 'Map view' : 'List view (a11y)'}
      </button>
    </Panel>
  );

  if (listView) {
    return (
      <div className="h-full w-full overflow-auto bg-white p-4">
        <div className="mb-3">
          <button onClick={() => setListView(false)} className="rounded-lg border border-[#e4e7eb] bg-white px-3 py-1.5 text-xs font-semibold">
            Map view
          </button>
        </div>
        <ul role="tree" aria-label="Requirement tree">
          <TreeItem node={hierarchy.root} depth={0} />
        </ul>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]"
      tabIndex={0}
      role="application"
      aria-label="Requirement mindmap. Arrow keys navigate and open the inspector; Escape deselects. Use the List view button for a screen-reader-friendly tree."
      onKeyDown={onKeyDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        onNodeClick={(_e, n) => select(n.id)}
        onPaneClick={() => select(null)}
        proOptions={{ hideAttribution: true }}
        disableKeyboardA11y
      >
        <Background color="#dfe3e8" gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeColor="#d3d8de" nodeColor="#e4e7eb" maskColor="rgba(241,243,245,.6)" />
        {Toggle}
        <Legend milestones={hierarchy.milestones} />
      </ReactFlow>
    </div>
  );
}

export function Mindmap({ hierarchy }: { hierarchy: Hierarchy }) {
  return (
    <ReactFlowProvider>
      <Canvas hierarchy={hierarchy} />
    </ReactFlowProvider>
  );
}
