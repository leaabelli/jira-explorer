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
  /**
   * The full, untouched source `fields` object from the tracker (Jira `fields`). Kept verbatim so
   * an LLM (and the inspector's "All fields" view) sees every detail, not just the curated subset
   * above. Optional: absent on issues synced before this was captured.
   */
  raw?: Record<string, unknown>;
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

// ── Epic grouping (macro-block view) ───────────────────────────────────────────
// Pure, testable bucketing so a requirement with many epics reads as a few labeled blocks
// (by delivery quarter or by milestone) instead of one unbounded vertical list.

export type GroupMode = 'none' | 'quarter' | 'milestone';

/** An ordered bucket of epics for the grouped canvas view. */
export interface EpicGroup {
  /** stable bucket id (quarter id, milestone key, or sentinel) */
  id: string;
  label: string;
  epicKeys: string[];
}

const NO_DATE = 'No delivery date';
const NO_MILESTONE = 'No milestone';

/** Calendar quarter label for an ISO date, e.g. '2026-Q2'; missing/invalid → "No delivery date". */
export function quarterOf(isoDate?: string): string {
  if (!isoDate) return NO_DATE;
  const ms = Date.parse(isoDate.length <= 10 ? isoDate + 'T00:00:00Z' : isoDate);
  if (Number.isNaN(ms)) return NO_DATE;
  const d = new Date(ms);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

/**
 * Bucket epics for the grouped view. By quarter (chronological, "No delivery date" last) or by
 * milestone membership (epics in multiple milestones appear in each; orphans go to "No milestone"
 * last, milestones ordered by dueDate). Pure: caller supplies the milestone overlay for labels.
 */
export function groupEpics(epics: Issue[], mode: GroupMode, milestones: Milestone[]): EpicGroup[] {
  if (mode === 'quarter') {
    const byQ = new Map<string, string[]>();
    for (const e of epics) {
      const q = quarterOf(e.deliveryDate);
      (byQ.get(q) ?? byQ.set(q, []).get(q)!).push(e.key);
    }
    return [...byQ.entries()]
      .map(([id, epicKeys]) => ({ id, label: id === NO_DATE ? id : id, epicKeys }))
      .sort((a, b) => rankQuarter(a.id) - rankQuarter(b.id) || a.id.localeCompare(b.id));
  }

  if (mode === 'milestone') {
    const msByKey = new Map(milestones.map((m) => [m.key, m]));
    const buckets = new Map<string, string[]>();
    for (const e of epics) {
      const keys = e.milestoneKeys.length ? e.milestoneKeys : [NO_MILESTONE];
      for (const mk of keys) (buckets.get(mk) ?? buckets.set(mk, []).get(mk)!).push(e.key);
    }
    return [...buckets.entries()]
      .map(([id, epicKeys]) => ({
        id,
        label: id === NO_MILESTONE ? id : (msByKey.get(id)?.name ?? id),
        epicKeys,
      }))
      .sort((a, b) => rankMilestone(a.id, msByKey) - rankMilestone(b.id, msByKey) || a.label.localeCompare(b.label));
  }

  return [{ id: 'all', label: 'All epics', epicKeys: epics.map((e) => e.key) }];
}

/** Quarters sort chronologically; the "no date" bucket always last. */
function rankQuarter(id: string): number {
  if (id === NO_DATE) return Number.POSITIVE_INFINITY;
  const m = /^(\d{4})-Q([1-4])$/.exec(id);
  return m ? Number(m[1]) * 4 + Number(m[2]) : Number.POSITIVE_INFINITY - 1;
}

/** Milestones sort by due date; undated milestones then the "no milestone" bucket last. */
function rankMilestone(id: string, msByKey: Map<string, Milestone>): number {
  if (id === NO_MILESTONE) return Number.POSITIVE_INFINITY;
  const due = msByKey.get(id)?.dueDate;
  const t = due ? Date.parse(due) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY - 1 : t;
}
