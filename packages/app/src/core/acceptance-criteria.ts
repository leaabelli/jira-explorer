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

import type { AcceptanceCriteriaSource, AcceptanceCriterion } from '@jira-explorer/shared';

// Extract acceptance criteria from a requirement, per the Profile's configured source (O1).
// Pure and heavily tested: this is the load-bearing unknown, so it must degrade gracefully
// (return [] -> the UI shows "Coverage unavailable", never a fake number).

const CHECKED = /^(\[x\]|\(\/\)|\(x\)|\[X\])/;
const UNCHECKED = /^(\[\s\]|\(\s\)|\[\s*\])/;
// A markdown (## .. ######) or wiki (h1. .. h6.) heading, or a bold-only line. NOT a single
// `#` (that is a wiki numbered-list item). Used both to find sections and to stop them.
const HEADING_LINE = /^\s*(#{2,6}\s|h[1-6]\.\s|\*\*[^*]+\*\*\s*:?\s*$)/i;

/** A list-ish line: markdown/wiki bullet, number, or checkbox. Returns null if not a list item. */
function asListItem(line: string): { text: string; checked: boolean } | null {
  let s = line.trim();
  if (!s) return null;
  if (HEADING_LINE.test(s)) return null; // a heading is never a list item
  // strip a single-level leading bullet / wiki number (#) / ordinal / dash
  const m = s.match(/^([-*]\s+|#\s*|\d+[.)]\s+)/);
  if (m) s = s.slice(m[0].length).trim();
  else if (!/^(\[.?\]|\(.?\))/.test(s)) return null; // not a bullet and not a bare checkbox
  let checked = false;
  if (CHECKED.test(s)) {
    checked = true;
    s = s.replace(CHECKED, '').trim();
  } else if (UNCHECKED.test(s)) {
    s = s.replace(UNCHECKED, '').trim();
  }
  s = s.replace(/^[:\-–]\s*/, '').trim();
  return s ? { text: s, checked } : null;
}

function parseListItems(text: string): Array<{ text: string; checked: boolean }> {
  return text
    .split(/\r?\n/)
    .map(asListItem)
    .filter((x): x is { text: string; checked: boolean } => x !== null);
}

const HEADING = /^\s*(h[1-6]\.\s*|#{1,6}\s*|\*\*?)?(.+?)(\*\*?)?\s*:?\s*$/i;

/** Find the section under `heading` in a description and return its raw lines (until next heading). */
function sectionUnderHeading(description: string, heading: string): string {
  const lines = description.split(/\r?\n/);
  const target = heading.trim().toLowerCase();
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(HEADING);
    const label = m?.[2]?.trim().toLowerCase();
    if (label === target) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return '';
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    // stop at the next real heading once we've captured some content
    if (HEADING_LINE.test(line) && out.some((l) => l.trim())) break;
    out.push(line);
  }
  return out.join('\n');
}

export function parseAcceptanceCriteria(
  source: AcceptanceCriteriaSource,
  raw: { description?: string; fieldValue?: unknown },
): AcceptanceCriterion[] {
  let items: Array<{ text: string; checked: boolean }> = [];

  switch (source.kind) {
    case 'none':
      return [];
    case 'description-section': {
      const section = sectionUnderHeading(raw.description ?? '', source.heading);
      items = parseListItems(section);
      break;
    }
    case 'custom-field':
    case 'checklist-field': {
      const v = raw.fieldValue;
      if (typeof v === 'string') {
        items = parseListItems(v);
        // fall back: if the field is plain text with no bullets, treat non-empty lines as items
        if (items.length === 0) {
          items = v
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((text) => ({ text, checked: false }));
        }
      } else if (Array.isArray(v)) {
        items = v
          .map((el) => {
            if (typeof el === 'string') return { text: el, checked: false };
            const o = el as Record<string, unknown>;
            const text = String(o.text ?? o.name ?? o.value ?? '').trim();
            const checked = Boolean(o.checked ?? o.done ?? o.isChecked);
            return text ? { text, checked } : null;
          })
          .filter((x): x is { text: string; checked: boolean } => x !== null);
      }
      break;
    }
  }

  return items.map((it, i) => ({ id: `AC-${i + 1}`, text: it.text, checked: it.checked }));
}
