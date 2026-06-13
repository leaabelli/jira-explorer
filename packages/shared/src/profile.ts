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

// The Profile maps the abstract Requirement/Epic/Task/Milestone model onto a concrete tracker
// instance. It is adapter-scoped (CEO-review D1): a Linear/GitHub adapter would ship its own
// profile shape, but the engine only ever sees this validated config.

/** How to recognize issues at a level. Any rule that is set must match (AND). */
export const identityRuleSchema = z.object({
  issueTypes: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  jql: z.string().optional(),
});

/** How a child level links to its parent. */
export const parentLinkSchema = z.discriminatedUnion('kind', [
  /** classic Jira DC "Epic Link" custom field */
  z.object({ kind: z.literal('epic-link') }),
  /** an issue link type, e.g. "implements" outward */
  z.object({
    kind: z.literal('issue-link'),
    linkType: z.string(),
    direction: z.enum(['inward', 'outward']),
  }),
  /** subtask parent */
  z.object({ kind: z.literal('parent') }),
  /** explicit JQL with a {parentKeys} placeholder */
  z.object({ kind: z.literal('jql'), template: z.string() }),
]);

/** Where acceptance criteria live (open question O1). */
export const acceptanceCriteriaSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('custom-field'), fieldId: z.string() }),
  z.object({
    kind: z.literal('description-section'),
    heading: z.string().default('Acceptance Criteria'),
  }),
  z.object({ kind: z.literal('checklist-field'), fieldId: z.string() }),
]);

export const fieldMapSchema = z.object({
  /** field id for delivery date; default is the standard `duedate` */
  deliveryDate: z.string().optional(),
});

export const levelSchema = z.object({
  key: z.enum(['requirement', 'epic', 'task']),
  displayName: z.string(),
  identity: identityRuleSchema,
  /** requirement (the root) has no parent link */
  parentLink: parentLinkSchema.optional(),
  fieldMap: fieldMapSchema.default({}),
  acceptanceCriteria: acceptanceCriteriaSourceSchema.default({ kind: 'none' }),
});

export const milestoneConfigSchema = z.object({
  identity: identityRuleSchema,
  /** link tying a milestone to its member epics */
  link: parentLinkSchema,
  dueDateField: z.string().optional(),
});

export const scopeSchema = z.object({
  projectKeys: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  extraJql: z.string().optional(),
});

export const profileSchema = z.object({
  tracker: z.literal('jira-dc').default('jira-dc'),
  levels: z.array(levelSchema).min(1),
  milestone: milestoneConfigSchema.optional(),
  /** tracker-specific knobs (instance-dependent, O4) */
  jira: z
    .object({
      /** DC "Epic Link" custom field id, e.g. customfield_10014 */
      epicLinkFieldId: z.string().optional(),
    })
    .optional(),
});

export type IdentityRule = z.infer<typeof identityRuleSchema>;
export type ParentLink = z.infer<typeof parentLinkSchema>;
export type AcceptanceCriteriaSource = z.infer<typeof acceptanceCriteriaSourceSchema>;
export type Level = z.infer<typeof levelSchema>;
export type MilestoneConfig = z.infer<typeof milestoneConfigSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type Profile = z.infer<typeof profileSchema>;

export function parseProfile(input: unknown): Profile {
  return profileSchema.parse(input);
}

/** Default profile matching the user's structure; O1 tunes acceptanceCriteria in the UI. */
export const DEFAULT_PROFILE: Profile = profileSchema.parse({
  tracker: 'jira-dc',
  levels: [
    {
      key: 'requirement',
      displayName: 'Requirement',
      identity: { issueTypes: ['Requirement'], labels: ['requirement'] },
      // O1: assume a description section by default; switch to custom-field/checklist when known.
      acceptanceCriteria: { kind: 'description-section', heading: 'Acceptance Criteria' },
    },
    {
      key: 'epic',
      displayName: 'Epic',
      identity: { issueTypes: ['Epic'] },
      parentLink: { kind: 'issue-link', linkType: 'implements', direction: 'outward' },
    },
    {
      key: 'task',
      displayName: 'Task',
      identity: { issueTypes: ['Task', 'Story', 'Sub-task', 'Bug'] },
      parentLink: { kind: 'epic-link' },
    },
  ],
  milestone: {
    identity: { issueTypes: ['Milestone'] },
    link: { kind: 'issue-link', linkType: 'includes', direction: 'outward' },
  },
});

export function levelByKey(profile: Profile, key: Level['key']): Level | undefined {
  return profile.levels.find((l) => l.key === key);
}
