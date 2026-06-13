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

import { z } from 'zod';
import { profileSchema, scopeSchema, type Profile, type Scope } from './profile';

// A "project" = one saved Jira exploration: a connection + scope + profile + its own cache.
// The PAT is never returned to the client; `hasPat` signals whether one is stored.

export interface Project {
  id: string;
  name: string;
  baseUrl: string;
  hasPat: boolean;
  scope: Scope;
  profile: Profile;
  createdAt: string;
  lastSyncedAt?: string;
}

export const projectInputSchema = z.object({
  name: z.string().min(1, 'name is required'),
  baseUrl: z.string().default(''),
  /** set/replace the PAT; omit to keep the existing one; empty string clears it */
  pat: z.string().optional(),
  scope: scopeSchema.optional(),
  profile: profileSchema.optional(),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;
