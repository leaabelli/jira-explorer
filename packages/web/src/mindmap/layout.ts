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
import type { CoverageProxy, HierarchyNode, Issue, LevelKey } from '@jira-explorer/shared';

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
