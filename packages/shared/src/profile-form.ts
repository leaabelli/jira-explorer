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

import {
  profileSchema,
  type AcceptanceCriteriaSource,
  type ParentLink,
  type Profile,
} from './profile';

// A flat, UI-friendly view of a Profile for a structured editor (T-PROFILE-EDITOR). Pure + tested,
// so the form is dumb. The full Profile is still the source of truth (an "advanced JSON" escape
// hatch covers anything the structured form can't represent, e.g. JQL identity/parent rules).

export type AcKind = 'none' | 'description-section' | 'custom-field' | 'checklist-field';
export interface AcForm {
  kind: AcKind;
  heading?: string;
  fieldId?: string;
}

export type ParentKind = 'epic-link' | 'issue-link' | 'parent';
export interface ParentForm {
  kind: ParentKind;
  linkType?: string;
  direction?: 'inward' | 'outward';
}

export interface ProfileForm {
  epicLinkFieldId?: string;
  requirement: { issueTypes: string; labels: string; ac: AcForm };
  epic: { issueTypes: string; parent: ParentForm };
  task: { issueTypes: string; parent: ParentForm };
  milestone: { enabled: boolean; issueTypes: string; linkType: string; direction: 'inward' | 'outward' };
}

const csv = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

function acSource(ac: AcForm): AcceptanceCriteriaSource {
  switch (ac.kind) {
    case 'none':
      return { kind: 'none' };
    case 'description-section':
      return { kind: 'description-section', heading: ac.heading || 'Acceptance Criteria' };
    case 'custom-field':
      return { kind: 'custom-field', fieldId: ac.fieldId ?? '' };
    case 'checklist-field':
      return { kind: 'checklist-field', fieldId: ac.fieldId ?? '' };
  }
}

function parentLink(p: ParentForm): ParentLink {
  switch (p.kind) {
    case 'epic-link':
      return { kind: 'epic-link' };
    case 'parent':
      return { kind: 'parent' };
    case 'issue-link':
      return { kind: 'issue-link', linkType: p.linkType || 'implements', direction: p.direction || 'outward' };
  }
}

export function buildProfile(form: ProfileForm): Profile {
  const profile: Record<string, unknown> = {
    tracker: 'jira-dc',
    levels: [
      {
        key: 'requirement',
        displayName: 'Requirement',
        identity: { issueTypes: csv(form.requirement.issueTypes), labels: csv(form.requirement.labels) },
        acceptanceCriteria: acSource(form.requirement.ac),
      },
      {
        key: 'epic',
        displayName: 'Epic',
        identity: { issueTypes: csv(form.epic.issueTypes) },
        parentLink: parentLink(form.epic.parent),
      },
      {
        key: 'task',
        displayName: 'Task',
        identity: { issueTypes: csv(form.task.issueTypes) },
        parentLink: parentLink(form.task.parent),
      },
    ],
  };
  if (form.milestone.enabled) {
    profile.milestone = {
      identity: { issueTypes: csv(form.milestone.issueTypes) },
      link: { kind: 'issue-link', linkType: form.milestone.linkType || 'includes', direction: form.milestone.direction || 'outward' },
    };
  }
  if (form.epicLinkFieldId) profile.jira = { epicLinkFieldId: form.epicLinkFieldId };
  return profileSchema.parse(profile);
}

function parentToForm(pl?: ParentLink): ParentForm {
  if (pl?.kind === 'issue-link') return { kind: 'issue-link', linkType: pl.linkType, direction: pl.direction };
  if (pl?.kind === 'parent') return { kind: 'parent' };
  return { kind: 'epic-link' }; // epic-link, or jql (not representable) -> sensible default
}

function acToForm(ac: AcceptanceCriteriaSource): AcForm {
  switch (ac.kind) {
    case 'description-section':
      return { kind: 'description-section', heading: ac.heading };
    case 'custom-field':
      return { kind: 'custom-field', fieldId: ac.fieldId };
    case 'checklist-field':
      return { kind: 'checklist-field', fieldId: ac.fieldId };
    default:
      return { kind: 'none' };
  }
}

export function profileToForm(p: Profile): ProfileForm {
  const lv = (k: 'requirement' | 'epic' | 'task') => p.levels.find((l) => l.key === k);
  const req = lv('requirement');
  const epic = lv('epic');
  const task = lv('task');
  const ms = p.milestone;
  return {
    epicLinkFieldId: p.jira?.epicLinkFieldId,
    requirement: {
      issueTypes: (req?.identity.issueTypes ?? []).join(', '),
      labels: (req?.identity.labels ?? []).join(', '),
      ac: acToForm(req?.acceptanceCriteria ?? { kind: 'none' }),
    },
    epic: { issueTypes: (epic?.identity.issueTypes ?? []).join(', '), parent: parentToForm(epic?.parentLink) },
    task: { issueTypes: (task?.identity.issueTypes ?? []).join(', '), parent: parentToForm(task?.parentLink) },
    milestone: ms
      ? {
          enabled: true,
          issueTypes: (ms.identity.issueTypes ?? []).join(', '),
          linkType: ms.link.kind === 'issue-link' ? ms.link.linkType : 'includes',
          direction: ms.link.kind === 'issue-link' ? ms.link.direction : 'outward',
        }
      : { enabled: false, issueTypes: '', linkType: 'includes', direction: 'outward' },
  };
}
