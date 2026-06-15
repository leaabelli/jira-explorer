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

import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import type {
  CoverageProxy,
  GroupMode,
  HierarchyNode,
  Issue,
  LevelKey,
  Milestone,
} from '@criterio/shared';
import { groupEpics } from '@criterio/shared';

// Pure-ish layout: walk the hierarchy honoring the expanded set, size nodes per level, run
// dagre left->right, and return React Flow nodes + edges. Folded subtrees are excluded.

export interface NodeData extends Record<string, unknown> {
  issue: Issue;
  coverage?: CoverageProxy;
  hasChildren: boolean;
  expanded: boolean;
}

const SIZE: Record<LevelKey, { w: number; h: number }> = {
  requirement: { w: 248, h: 104 },
  epic: { w: 220, h: 84 },
  task: { w: 176, h: 44 },
};

export function layoutHierarchy(
  root: HierarchyNode,
  expanded: Set<string>,
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const rfNodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];

  const walk = (node: HierarchyNode, parentKey?: string) => {
    const { issue } = node;
    const size = SIZE[issue.level];
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(issue.key);
    g.setNode(issue.key, { width: size.w, height: size.h });
    rfNodes.push({
      id: issue.key,
      type: issue.level,
      position: { x: 0, y: 0 },
      data: {
        issue,
        coverage: node.coverage,
        hasChildren,
        expanded: isOpen,
      },
    });
    if (parentKey) {
      g.setEdge(parentKey, issue.key);
      edges.push({
        id: `${parentKey}->${issue.key}`,
        source: parentKey,
        target: issue.key,
        type: 'smoothstep',
        style: { stroke: '#c7cdd4', strokeWidth: 1.5 },
      });
    }
    if (hasChildren && isOpen) for (const c of node.children) walk(c, issue.key);
  };

  walk(root);
  dagre.layout(g);

  for (const n of rfNodes) {
    const { x, y, width, height } = g.node(n.id);
    n.position = { x: x - width / 2, y: y - height / 2 };
  }
  return { nodes: rfNodes, edges };
}

// ── Grouped (macro-block) layout ──────────────────────────────────────────────
// Pack a requirement's epics into labeled container blocks (by delivery quarter or milestone) so a
// requirement with many epics reads as a few blocks, not an unbounded vertical list. Manual grid
// layout (dagre doesn't nest); tasks aren't drawn here — this is an epic-level overview.

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  count: number;
}

const GROUP = {
  reqGap: 96, // gap between requirement and the first block column
  vGap: 32, // vertical gap between blocks
  pad: 16,
  headerH: 40,
  cols: 3,
  cellW: 220,
  cellH: 96,
  cellGapX: 16,
  cellGapY: 16,
};

function blockWidth(cols: number): number {
  return GROUP.pad * 2 + cols * GROUP.cellW + (cols - 1) * GROUP.cellGapX;
}
function blockHeight(rows: number): number {
  return GROUP.headerH + GROUP.pad + rows * GROUP.cellH + (rows - 1) * GROUP.cellGapY + GROUP.pad;
}

/**
 * Lay out the requirement + its epics grouped into macro-blocks. Returns React Flow nodes where each
 * block is a parent container and its epics are children (`parentId` + `extent: 'parent'`), plus an
 * edge from the requirement to each block. Falls back to a single block when nothing groups.
 */
export function layoutGrouped(
  root: HierarchyNode,
  mode: GroupMode,
  milestones: Milestone[],
): { nodes: Node[]; edges: Edge[] } {
  const epicNodes = root.children.filter((c) => c.issue.level === 'epic');
  const byKey = new Map(epicNodes.map((n) => [n.issue.key, n]));
  const groups = groupEpics(
    epicNodes.map((n) => n.issue),
    mode,
    milestones,
  );

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // size each block first so we can vertically stack and center the requirement against the total
  const sized = groups.map((g) => {
    const cols = Math.min(GROUP.cols, Math.max(1, g.epicKeys.length));
    const rows = Math.max(1, Math.ceil(g.epicKeys.length / cols));
    return { g, cols, rows, w: blockWidth(cols), h: blockHeight(rows) };
  });
  const totalH = sized.reduce((s, b) => s + b.h, 0) + Math.max(0, sized.length - 1) * GROUP.vGap;

  const reqSize = SIZE.requirement;
  const blockX = reqSize.w + GROUP.reqGap;
  nodes.push({
    id: root.issue.key,
    type: 'requirement',
    position: { x: 0, y: Math.max(0, totalH / 2 - reqSize.h / 2) },
    data: { issue: root.issue, coverage: root.coverage, hasChildren: false, expanded: false },
  });

  let y = 0;
  for (const b of sized) {
    const groupId = `group:${b.g.id}`;
    nodes.push({
      id: groupId,
      type: 'group',
      position: { x: blockX, y },
      style: { width: b.w, height: b.h },
      data: { label: b.g.label, count: b.g.epicKeys.length } satisfies GroupNodeData,
      selectable: false,
      draggable: false,
    });
    edges.push({
      id: `${root.issue.key}->${groupId}`,
      source: root.issue.key,
      target: groupId,
      type: 'smoothstep',
      style: { stroke: '#c7cdd4', strokeWidth: 1.5 },
    });
    b.g.epicKeys.forEach((ek, idx) => {
      const node = byKey.get(ek);
      if (!node) return;
      const col = idx % b.cols;
      const rowIdx = Math.floor(idx / b.cols);
      nodes.push({
        id: ek,
        type: 'epic',
        parentId: groupId,
        extent: 'parent',
        position: {
          x: GROUP.pad + col * (GROUP.cellW + GROUP.cellGapX),
          y: GROUP.headerH + GROUP.pad + rowIdx * (GROUP.cellH + GROUP.cellGapY),
        },
        data: { issue: node.issue, coverage: node.coverage, hasChildren: false, expanded: false },
      });
    });
    y += b.h + GROUP.vGap;
  }

  return { nodes, edges };
}

/** Keys that have children, for initialising the expanded set (default: all open). */
export function allExpandableKeys(root: HierarchyNode): string[] {
  const out: string[] = [];
  const walk = (n: HierarchyNode) => {
    if (n.children.length) {
      out.push(n.issue.key);
      n.children.forEach(walk);
    }
  };
  walk(root);
  return out;
}
