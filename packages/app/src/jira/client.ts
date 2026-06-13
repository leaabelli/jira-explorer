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

import pLimit from 'p-limit';
import type { ApiError } from '@jira-explorer/shared';
import type { RawIssue } from './mappers';

// Low-level Jira DC REST v2 client: PAT bearer auth, concurrency-limited, retry/backoff on
// 429/5xx, paginated POST /search. `fetchFn` is injectable so the adapter is unit-testable
// against recorded DC fixtures (eng-review D4).

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface JiraClientOptions {
  baseUrl: string;
  pat: string;
  fetchFn?: FetchFn;
  maxConcurrent?: number;
  maxRetries?: number;
  /** base backoff ms (kept tiny in tests) */
  backoffMs?: number;
}

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiError['code'],
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

function codeForStatus(status: number): ApiError['code'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 400) return 'jira';
  return 'unknown';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class JiraClient {
  private readonly base: string;
  private readonly fetchFn: FetchFn;
  private readonly limit: <T>(fn: () => Promise<T>) => Promise<T>;
  private readonly maxRetries: number;
  private readonly backoffMs: number;

  constructor(private readonly opts: JiraClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.limit = pLimit(opts.maxConcurrent ?? 5);
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffMs = opts.backoffMs ?? 400;
  }

  private async request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    return this.limit(async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await this.fetchFn(`${this.base}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.opts.pat}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
          },
        });
        if (res.ok) {
          const text = await res.text();
          return (text ? JSON.parse(text) : null) as T;
        }
        if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
          await sleep(this.backoffMs * 2 ** attempt);
          continue;
        }
        let detail = res.statusText;
        try {
          detail = (await res.text()) || detail;
        } catch {
          /* ignore */
        }
        throw new JiraError(
          `Jira ${res.status}: ${detail.slice(0, 300)}`,
          res.status,
          codeForStatus(res.status),
        );
      }
    });
  }

  async myself(): Promise<{ displayName: string; name?: string }> {
    return this.request('/rest/api/2/myself');
  }

  /** Paginated JQL search. Yields raw issues until exhausted. */
  async *search(jql: string, fields: string[], pageSize = 100): AsyncGenerator<RawIssue> {
    let startAt = 0;
    for (;;) {
      const data = await this.request<{ issues?: RawIssue[]; total?: number }>(
        '/rest/api/2/search',
        { method: 'POST', body: JSON.stringify({ jql, fields, startAt, maxResults: pageSize }) },
      );
      const issues = data?.issues ?? [];
      for (const it of issues) yield it;
      startAt += issues.length;
      if (issues.length === 0 || startAt >= (data?.total ?? 0)) break;
    }
  }

  async getIssue(key: string, fields: string[]): Promise<RawIssue> {
    return this.request(`/rest/api/2/issue/${encodeURIComponent(key)}?fields=${fields.join(',')}`);
  }

  async updateIssue(key: string, fields: Record<string, unknown>): Promise<void> {
    await this.request(`/rest/api/2/issue/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
  }

  async listTransitions(key: string): Promise<Array<{ id: string; name: string }>> {
    const data = await this.request<{ transitions?: Array<{ id: string; name: string }> }>(
      `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`,
    );
    return data?.transitions ?? [];
  }

  async transition(key: string, transitionId: string): Promise<void> {
    await this.request(`/rest/api/2/issue/${encodeURIComponent(key)}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }
}
