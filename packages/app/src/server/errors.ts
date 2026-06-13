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

import type { ApiError } from '@jira-explorer/shared';
import { ZodError } from 'zod';
import { JiraError } from '../jira/client';
import { RootNotFoundError } from '../sync/engine';

// Map any thrown error to an HTTP status + a typed ApiError body. No silent failures: every
// path the user can hit returns a named code the UI maps to a designed state.
export function toApiError(e: unknown): { status: number; body: ApiError } {
  if (e instanceof RootNotFoundError) {
    return { status: 404, body: { error: e.message, code: 'not_found' } };
  }
  if (e instanceof JiraError) {
    const status =
      e.code === 'auth'
        ? 401
        : e.code === 'not_found'
          ? 404
          : e.code === 'rate_limited'
            ? 429
            : e.code === 'validation'
              ? 400
              : 502;
    return { status, body: { error: e.message, code: e.code } };
  }
  if (e instanceof ZodError) {
    return { status: 400, body: { error: e.message, code: 'validation' } };
  }
  return {
    status: 500,
    body: { error: e instanceof Error ? e.message : String(e), code: 'unknown' },
  };
}
