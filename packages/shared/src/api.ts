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

// REST DTOs shared between server and web. Domain entities (Hierarchy, Issue, ...) are the
// main payloads; these wrap connection/sync/error concerns.

export interface ConnectionStatus {
  ok: boolean;
  /** display name of the authenticated user, when ok */
  user?: string;
  /** error message when not ok */
  error?: string;
  baseUrl?: string;
}

export interface SyncResult {
  rootKey: string;
  issueCount: number;
  epicCount: number;
  taskCount: number;
  milestoneCount: number;
  /** keys that failed to load (partial sync) */
  failedKeys: string[];
  syncedAt: string;
}

export interface ApiError {
  error: string;
  /** machine code, e.g. 'auth', 'not_found', 'rate_limited', 'jira', 'unknown' */
  code: 'auth' | 'not_found' | 'rate_limited' | 'jira' | 'validation' | 'unknown';
}

/** Editable fields on an epic (write-back). */
export interface EpicPatch {
  summary?: string;
  description?: string;
  /** ISO date YYYY-MM-DD */
  deliveryDate?: string;
  assigneeName?: string;
  labels?: string[];
}

/** An edit saved locally but not yet pushed to Jira (staged write-back). */
export interface PendingChange {
  key: string;
  rootKey: string;
  patch: EpicPatch;
  /** ISO timestamp of the last local edit */
  updatedAt: string;
}

/** Outcome of flushing pending changes to Jira. The batch never aborts on a single failure. */
export interface PushResult {
  pushed: string[];
  failed: Array<{ key: string; error: string }>;
}
