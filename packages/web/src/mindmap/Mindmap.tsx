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

import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Hierarchy } from '@jira-explorer/shared';
import { allExpandableKeys, layoutHierarchy } from './layout';
import { nodeTypes } from './nodes';
import { useMindmap } from './store';

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

function Canvas({ hierarchy }: { hierarchy: Hierarchy }) {
  const expanded = useMindmap((s) => s.expanded);
  const setExpanded = useMindmap((s) => s.setExpanded);
  const select = useMindmap((s) => s.select);
  const rootKey = hierarchy.root.issue.key;

  useEffect(() => {
    setExpanded(allExpandableKeys(hierarchy.root));
  }, [rootKey, setExpanded, hierarchy.root]);

  const { nodes, edges } = useMemo(
    () => layoutHierarchy(hierarchy.root, expanded),
    [hierarchy, expanded],
  );

  return (
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
    >
      <Background color="#dfe3e8" gap={22} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeStrokeColor="#d3d8de" nodeColor="#e4e7eb" maskColor="rgba(241,243,245,.6)" />
      <Legend milestones={hierarchy.milestones} />
    </ReactFlow>
  );
}

export function Mindmap({ hierarchy }: { hierarchy: Hierarchy }) {
  return (
    <ReactFlowProvider>
      <Canvas hierarchy={hierarchy} />
    </ReactFlowProvider>
  );
}
