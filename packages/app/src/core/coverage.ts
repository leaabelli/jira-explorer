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

import type { CoverageProxy, Issue } from '@criterio/shared';

// Deterministic coverage PROXY (eng-review D2). Acceptance criteria are not linkable in Jira,
// so we never claim a per-criterion X/N here. We report: how many criteria the requirement has,
// and how many epics link to it. The AI-verified per-criterion result is a separate, later
// artifact (P6/P7) that is cached, cited, and human-confirmed.
export function computeCoverageProxy(requirement: Issue, linkedEpics: Issue[]): CoverageProxy {
  const criteriaCount = requirement.acceptanceCriteria.length;
  return {
    kind: 'proxy',
    criteriaCount,
    linkedEpicCount: linkedEpics.length,
    criteriaUnavailable: criteriaCount === 0,
  };
}
