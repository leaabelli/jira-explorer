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

import type { Hierarchy, HierarchyNode, Issue } from '@jira-explorer/shared';

// Export the requirement tree for an LLM (req #6) and for humans. The markdown "context pack" is
// laid out so an LLM can check whether the epics cover each acceptance criterion and cite the
// epic keys — the soul of the product, in plain text.

function epicsOf(root: HierarchyNode): HierarchyNode[] {
  return root.children.filter((c) => c.issue.level === 'epic');
}

function esc(s: string): string {
  return s.replace(/\r/g, '');
}

/** LLM context pack. */
export function toContextMarkdown(h: Hierarchy): string {
  const r = h.root.issue;
  const cov = h.root.coverage;
  const lines: string[] = [];
  lines.push(`# Requirement ${r.key}: ${r.summary}`);
  lines.push('');
  lines.push(`- Status: ${r.status}`);
  if (cov) {
    lines.push(
      cov.criteriaUnavailable
        ? `- Coverage: acceptance criteria could not be extracted for this requirement`
        : `- Coverage (deterministic proxy): ${cov.criteriaCount} acceptance criteria, ${cov.linkedEpicCount} epics linked`,
    );
  }
  if (r.description) {
    lines.push('', '## Description', '', esc(r.description));
  }

  lines.push('', '## Acceptance Criteria', '');
  if (r.acceptanceCriteria.length === 0) {
    lines.push('_None extracted._');
  } else {
    for (const c of r.acceptanceCriteria) lines.push(`- [${c.id}] ${c.text}`);
  }

  lines.push('', '## Epics', '');
  const epics = epicsOf(h.root);
  if (epics.length === 0) lines.push('_No epics linked._');
  for (const e of epics) {
    const i = e.issue;
    const meta = [`status: ${i.status}`];
    if (i.deliveryDate) meta.push(`delivery: ${i.deliveryDate}`);
    if (i.assignee) meta.push(`owner: ${i.assignee.displayName}`);
    if (i.milestoneKeys.length) meta.push(`milestones: ${i.milestoneKeys.join(', ')}`);
    lines.push(`### ${i.key}: ${i.summary}`);
    lines.push(`(${meta.join(' · ')})`);
    if (i.description) lines.push('', esc(i.description));
    const tasks = e.children;
    if (tasks.length) {
      lines.push('', 'Tasks:');
      for (const t of tasks) lines.push(`- ${t.issue.key} ${t.issue.summary} (${t.issue.status})`);
    }
    lines.push('');
  }

  if (h.milestones.length) {
    lines.push('## Milestones', '');
    for (const m of h.milestones) {
      lines.push(`- ${m.name}${m.dueDate ? ` (due ${m.dueDate})` : ''}: ${m.epicKeys.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(
    '## Coverage check (for the reviewing LLM)',
    '',
    'For EACH acceptance criterion listed above, identify which epic(s) implement it and cite the',
    'epic key(s). List any criterion with no implementing epic as a **GAP**. Do not invent epics;',
    'only use the ones listed. Conclude with `covered: X/N` and the list of uncovered criterion ids.',
  );

  return lines.join('\n');
}

/** Machine-readable JSON export. */
export function toJsonExport(h: Hierarchy): unknown {
  const node = (n: HierarchyNode): unknown => ({
    key: n.issue.key,
    level: n.issue.level,
    summary: n.issue.summary,
    status: n.issue.status,
    deliveryDate: n.issue.deliveryDate,
    assignee: n.issue.assignee?.displayName,
    milestoneKeys: n.issue.milestoneKeys,
    acceptanceCriteria: n.issue.acceptanceCriteria,
    coverage: n.coverage,
    children: n.children.map(node),
  });
  return { requirement: node(h.root), milestones: h.milestones };
}

/** E3: a short, human paste-ready coverage summary for a Jira comment / PR. */
export function toCoverageSummary(h: Hierarchy): string {
  const r = h.root.issue;
  const cov = h.root.coverage;
  const epics = epicsOf(h.root).map((e) => e.issue.key);
  const head = `**Coverage — ${r.key}: ${r.summary}**`;
  if (!cov || cov.criteriaUnavailable) {
    return `${head}\nAcceptance criteria unavailable for this requirement.`;
  }
  return [
    head,
    `${cov.criteriaCount} acceptance criteria · ${cov.linkedEpicCount} epics linked`,
    epics.length ? `Epics: ${epics.join(', ')}` : 'No epics linked.',
  ].join('\n');
}

/** E4: a self-contained static HTML snapshot of the tree (shareable, no install). */
export function toStaticHtml(h: Hierarchy): string {
  const li = (n: HierarchyNode): string => {
    const i = n.issue;
    const badge = i.deliveryDate ? ` <span class="d">${i.deliveryDate}</span>` : '';
    const cov =
      n.coverage && !n.coverage.criteriaUnavailable
        ? ` <span class="c">${n.coverage.criteriaCount} criteria · ${n.coverage.linkedEpicCount} epics</span>`
        : '';
    const kids = n.children.length ? `<ul>${n.children.map(li).join('')}</ul>` : '';
    return `<li><span class="k">${i.key}</span> <b class="${i.level}">${escapeHtml(i.summary)}</b>${badge}${cov} <span class="s">${escapeHtml(i.status)}</span>${kids}</li>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(h.root.issue.key)} — map</title>
<style>body{font:14px/1.5 'Plus Jakarta Sans',system-ui,sans-serif;color:#1a1d21;background:#f6f7f9;max-width:880px;margin:32px auto;padding:0 16px}
ul{list-style:none;border-left:1px solid #e4e7eb;margin-left:8px;padding-left:16px}
li{margin:6px 0}.k{font-family:'JetBrains Mono',monospace;font-size:11px;color:#0f766e}
.requirement{font-size:16px}.task{font-weight:500}
.d{background:#e6f6ec;color:#15803d;border-radius:6px;padding:1px 6px;font-size:11px}
.c{background:#d7efe9;color:#0f766e;border-radius:6px;padding:1px 6px;font-size:11px}
.s{color:#8b95a3;font-size:12px}</style></head>
<body><h1>${escapeHtml(h.root.issue.summary)}</h1><ul>${li(h.root)}</ul></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
