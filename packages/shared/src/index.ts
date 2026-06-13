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

// @jira-explorer/shared — browser-safe domain types, Zod schemas, and API DTOs.
// MUST NOT import node-only deps (used by core, mcp, server, AND the web bundle).

export const SHARED_VERSION = '0.1.0';

export * from './domain';
export * from './profile';
export * from './api';
