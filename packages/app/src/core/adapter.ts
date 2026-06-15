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

import type {
  ConnectionStatus,
  EpicPatch,
  Issue,
  Link,
  Milestone,
  Profile,
  Scope,
} from '@jira-explorer/shared';

// The tracker-agnostic seam (CEO-review D1). The sync engine orchestrates traversal in terms
// of this interface; a concrete adapter (Jira DC first) owns all tracker-specific concerns:
// JQL syntax, field ids, response shapes, IN-clause chunking, pagination.
//
//   sync engine                         adapter (e.g. jira-dc)
//   -----------                         ----------------------
//   fetchRoot(rootKey) ----------------> root requirement Issue | null
//   fetchChildren('epic', [root]) -----> { epics, links }     (chunks internally)
//   fetchChildren('task', epicKeys) ---> { tasks, links }     (chunks internally)
//   fetchMilestones(epicKeys) ---------> milestones overlay
//   updateEpic / transitionIssue ------> write-back to the real tracker

export interface TrackerAdapter {
  /** verify connectivity + auth */
  testConnection(): Promise<ConnectionStatus>;

  /** the root requirement by key; null if not found or out of scope */
  fetchRoot(rootKey: string, profile: Profile, scope: Scope): Promise<Issue | null>;

  /**
   * All in-scope issues at `levelKey` whose parent is one of `parentKeys`, plus the parent->child
   * links. The adapter MUST chunk `parentKeys` to stay under the tracker's query limits.
   */
  fetchChildren(
    levelKey: 'epic' | 'task',
    parentKeys: string[],
    profile: Profile,
    scope: Scope,
  ): Promise<{ issues: Issue[]; links: Link[] }>;

  /** milestones linking to the given epics (overlay) */
  fetchMilestones(epicKeys: string[], profile: Profile, scope: Scope): Promise<Milestone[]>;

  /**
   * Re-fetch only the issues among `keys` that changed at/after `since` (ISO). Used by incremental
   * refresh to update known issues' fields cheaply; it does NOT discover new / deleted / moved
   * issues — those still require a full sync.
   */
  fetchUpdated(
    levelKey: 'requirement' | 'epic' | 'task',
    keys: string[],
    since: string,
    profile: Profile,
    scope: Scope,
  ): Promise<Issue[]>;

  /** write-back: patch editable epic fields */
  updateEpic(key: string, patch: EpicPatch): Promise<void>;

  /** write-back: move an issue through a named workflow transition */
  transitionIssue(key: string, transitionName: string): Promise<void>;
}
