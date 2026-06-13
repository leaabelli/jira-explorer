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

// Browser-safe domain model. No node-only deps. Tracker-agnostic.

export type LevelKey = 'requirement' | 'epic' | 'task';

/** A Jira/tracker status, normalized to a category we can color by. */
export type StatusCategory = 'todo' | 'in_progress' | 'done' | 'unknown';

export interface Person {
  displayName: string;
  /** initials for avatars, precomputed so the UI stays dumb */
  initials: string;
}

export interface AcceptanceCriterion {
  /** stable id within the requirement (index-based if the source has none) */
  id: string;
  text: string;
  /** true once the source marks it checked/done (checklist plugins) */
  checked?: boolean;
}

/** A normalized issue at any level. */
export interface Issue {
  key: string;
  level: LevelKey;
  summary: string;
  status: string;
  statusCategory: StatusCategory;
  assignee?: Person;
  /** epics carry this; ISO date (YYYY-MM-DD) */
  deliveryDate?: string;
  description?: string;
  labels: string[];
  /** requirements carry these; empty array when the level has none */
  acceptanceCriteria: AcceptanceCriterion[];
  /** milestone keys this issue belongs to (overlay) */
  milestoneKeys: string[];
  /** absolute URL into the tracker */
  url: string;
  /** ISO timestamp of last update in the tracker */
  updated: string;
}

/** A milestone groups epics across requirements; rendered as an overlay, not a tree node. */
export interface Milestone {
  key: string;
  name: string;
  /** ISO date */
  dueDate?: string;
  /** epic keys that belong to this milestone */
  epicKeys: string[];
  url: string;
}

/** A directed edge between two issues (parent -> child). */
export interface Link {
  from: string;
  to: string;
  /** the level relationship this edge expresses */
  rel: 'requirement-epic' | 'epic-task';
}

/**
 * Deterministic coverage proxy (pre-LLM). Per eng-review D2: acceptance criteria are not
 * linkable, so we report counts + linkage, never a fake per-criterion X/N. The AI-verified
 * per-criterion result is a separate, later artifact.
 */
export interface CoverageProxy {
  kind: 'proxy';
  criteriaCount: number;
  /** epics linked to this requirement */
  linkedEpicCount: number;
  /** true when no acceptance criteria could be extracted (O1 unknown for this requirement) */
  criteriaUnavailable: boolean;
}

/** A node in the requirement-rooted tree the UI/MCP/export consume. */
export interface HierarchyNode {
  issue: Issue;
  children: HierarchyNode[];
  /** present on requirement nodes */
  coverage?: CoverageProxy;
}

export interface Hierarchy {
  root: HierarchyNode;
  milestones: Milestone[];
  /** flat index for quick lookup */
  issuesByKey: Record<string, Issue>;
}

export const DELIVERY_SOON_DAYS = 30;

export type DeliveryBand = 'overdue' | 'soon' | 'later';

/** Pure, testable: classify a delivery date relative to `today` (ISO date). */
export function deliveryBand(deliveryDate: string, today: string): DeliveryBand {
  const due = Date.parse(deliveryDate + 'T00:00:00Z');
  const now = Date.parse(today + 'T00:00:00Z');
  if (Number.isNaN(due) || Number.isNaN(now)) return 'later';
  const days = Math.round((due - now) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days <= DELIVERY_SOON_DAYS) return 'soon';
  return 'later';
}

/** Pure: initials from a display name (max 2). */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
