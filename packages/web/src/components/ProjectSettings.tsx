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

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_PROFILE,
  buildProfile,
  profileToForm,
  type ConnectionStatus,
  type ProfileForm,
  type Project,
} from '@criterio/shared';
import { api, type ProjectInputBody } from '../api';

// Modal to create/edit a project: connection, scope, and a STRUCTURED profile editor (the AC
// source is the load-bearing O1 knob) with an advanced raw-JSON escape hatch.

const label = 'mb-1 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]';
const input = 'h-9 w-full rounded border border-[#d3d8de] px-2.5 text-sm outline-none focus:border-[#0f766e]';
const sel = 'h-8 rounded border border-[#d3d8de] px-1.5 text-sm outline-none focus:border-[#0f766e]';
const card = 'rounded-lg border border-[#e4e7eb] p-3';
const head = 'mb-2 text-[11px] font-bold uppercase tracking-wider text-[#8b95a3]';

export function ProjectSettings({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string | null;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const qc = useQueryClient();
  const editing = !!projectId;
  const existing = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: editing,
  });

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [pat, setPat] = useState('');
  const [projectKeys, setProjectKeys] = useState('');
  const [labels, setLabels] = useState('');
  const [extraJql, setExtraJql] = useState('');
  const [pf, setPf] = useState<ProfileForm>(() => profileToForm(DEFAULT_PROFILE));
  const [profileMode, setProfileMode] = useState<'form' | 'json'>('form');
  const [profileText, setProfileText] = useState(JSON.stringify(DEFAULT_PROFILE, null, 2));
  const [savedId, setSavedId] = useState<string | null>(projectId);
  const [testResult, setTestResult] = useState<ConnectionStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const pr = existing.data;
    if (!pr) return;
    setName(pr.name);
    setBaseUrl(pr.baseUrl);
    setProjectKeys(pr.scope.projectKeys.join(', '));
    setLabels(pr.scope.labels.join(', '));
    setExtraJql(pr.scope.extraJql ?? '');
    setPf(profileToForm(pr.profile));
    setProfileText(JSON.stringify(pr.profile, null, 2));
    setSavedId(pr.id);
  }, [existing.data]);

  const buildBody = (): ProjectInputBody | null => {
    let profile: unknown;
    try {
      profile = profileMode === 'json' ? JSON.parse(profileText) : buildProfile(pf);
      setFormError(null);
    } catch (e) {
      setFormError(`Profile: ${(e as Error).message}`);
      return null;
    }
    const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    return {
      name,
      baseUrl,
      ...(pat ? { pat } : {}),
      scope: { projectKeys: csv(projectKeys), labels: csv(labels), extraJql: extraJql || undefined },
      profile,
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const b = buildBody();
      if (!b) throw new Error(formError ?? 'invalid input');
      return editing ? api.projects.update(savedId!, b) : api.projects.create(b);
    },
    onSuccess: (proj) => {
      setSavedId(proj.id);
      setPat('');
      qc.invalidateQueries({ queryKey: ['projects'] });
      onSaved(proj);
    },
  });
  const test = useMutation({
    mutationFn: () => api.projects.connection(savedId!),
    onSuccess: (r) => setTestResult(r),
  });
  const del = useMutation({
    mutationFn: () => api.projects.remove(savedId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  // structured-profile updaters
  const setReqAcKind = (kind: ProfileForm['requirement']['ac']['kind']) =>
    setPf({ ...pf, requirement: { ...pf.requirement, ac: { ...pf.requirement.ac, kind } } });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="flex max-h-[90vh] w-[600px] flex-col gap-4 overflow-auto rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{editing ? 'Project settings' : 'New project'}</h2>
          <button onClick={onClose} className="text-[#8b95a3] hover:text-[#1a1d21]">✕</button>
        </div>

        <div>
          <div className={label}>Name</div>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments team" />
        </div>

        <div className={card}>
          <div className={head}>Connection (Jira Data Center)</div>
          <div className="mb-2"><div className={label}>Base URL</div>
            <input className={input} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://jira.your-company.com" /></div>
          <div className="mb-2"><div className={label}>Personal Access Token</div>
            <input type="password" className={input} value={pat} onChange={(e) => setPat(e.target.value)}
              placeholder={existing.data?.hasPat ? '•••••••• (unchanged)' : 'paste your PAT'} /></div>
          <div className="flex items-center gap-3">
            <button disabled={!savedId || test.isPending} onClick={() => test.mutate()} title={savedId ? '' : 'Save first'}
              className="h-8 rounded border border-[#d3d8de] bg-white px-3 text-xs font-semibold text-[#1a1d21] disabled:opacity-50">
              {test.isPending ? 'Testing…' : 'Test connection'}
            </button>
            {testResult && <span className={`text-xs ${testResult.ok ? 'text-[#15803d]' : 'text-[#dc2626]'}`}>{testResult.ok ? `OK — ${testResult.user}` : testResult.error}</span>}
          </div>
        </div>

        <div className={card}>
          <div className={head}>Scope</div>
          <div className="mb-2"><div className={label}>Project keys (comma)</div><input className={input} value={projectKeys} onChange={(e) => setProjectKeys(e.target.value)} placeholder="PLAT, BILLING" /></div>
          <div className="mb-2"><div className={label}>Labels (comma)</div><input className={input} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="team-payments" /></div>
          <div><div className={label}>Extra JQL (optional)</div><input className={input} value={extraJql} onChange={(e) => setExtraJql(e.target.value)} placeholder='fixVersion = "2026.Q3"' /></div>
        </div>

        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <span className={head + ' mb-0'}>Profile — map your Jira</span>
            <button onClick={() => setProfileMode(profileMode === 'form' ? 'json' : 'form')} className="text-[11px] font-semibold text-[#0f766e]">
              {profileMode === 'form' ? 'Advanced (JSON)' : 'Back to form'}
            </button>
          </div>

          {profileMode === 'json' ? (
            <textarea value={profileText} onChange={(e) => setProfileText(e.target.value)} rows={10}
              className="w-full rounded border border-[#d3d8de] p-2 font-mono text-xs outline-none focus:border-[#0f766e]" />
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              {/* Requirement */}
              <div>
                <div className={label}>Requirement issue types (comma)</div>
                <input className={input} value={pf.requirement.issueTypes} onChange={(e) => setPf({ ...pf, requirement: { ...pf.requirement, issueTypes: e.target.value } })} placeholder="Requirement" />
              </div>
              <div>
                <div className={label}>Acceptance criteria source (the key setting)</div>
                <div className="flex items-center gap-2">
                  <select className={sel} value={pf.requirement.ac.kind} onChange={(e) => setReqAcKind(e.target.value as ProfileForm['requirement']['ac']['kind'])}>
                    <option value="description-section">Description section</option>
                    <option value="custom-field">Custom field</option>
                    <option value="checklist-field">Checklist field</option>
                    <option value="none">None</option>
                  </select>
                  {pf.requirement.ac.kind === 'description-section' && (
                    <input className={input + ' flex-1'} placeholder="heading (e.g. Acceptance Criteria)" value={pf.requirement.ac.heading ?? ''} onChange={(e) => setPf({ ...pf, requirement: { ...pf.requirement, ac: { ...pf.requirement.ac, heading: e.target.value } } })} />
                  )}
                  {(pf.requirement.ac.kind === 'custom-field' || pf.requirement.ac.kind === 'checklist-field') && (
                    <input className={input + ' flex-1'} placeholder="field id (customfield_xxxxx)" value={pf.requirement.ac.fieldId ?? ''} onChange={(e) => setPf({ ...pf, requirement: { ...pf.requirement, ac: { ...pf.requirement.ac, fieldId: e.target.value } } })} />
                  )}
                </div>
              </div>

              {/* Epic */}
              <div>
                <div className={label}>Epic issue types · parent link</div>
                <div className="flex items-center gap-2">
                  <input className={input + ' flex-1'} value={pf.epic.issueTypes} onChange={(e) => setPf({ ...pf, epic: { ...pf.epic, issueTypes: e.target.value } })} placeholder="Epic" />
                  <select className={sel} value={pf.epic.parent.kind} onChange={(e) => setPf({ ...pf, epic: { ...pf.epic, parent: { ...pf.epic.parent, kind: e.target.value as ProfileForm['epic']['parent']['kind'] } } })}>
                    <option value="issue-link">issue link</option>
                    <option value="epic-link">epic link</option>
                    <option value="parent">parent</option>
                  </select>
                </div>
                {pf.epic.parent.kind === 'issue-link' && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <input className={input + ' flex-1'} placeholder="link type (e.g. implements)" value={pf.epic.parent.linkType ?? ''} onChange={(e) => setPf({ ...pf, epic: { ...pf.epic, parent: { ...pf.epic.parent, linkType: e.target.value } } })} />
                    <select className={sel} value={pf.epic.parent.direction ?? 'outward'} onChange={(e) => setPf({ ...pf, epic: { ...pf.epic, parent: { ...pf.epic.parent, direction: e.target.value as 'inward' | 'outward' } } })}>
                      <option value="outward">outward</option>
                      <option value="inward">inward</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Task */}
              <div>
                <div className={label}>Task issue types · parent link</div>
                <div className="flex items-center gap-2">
                  <input className={input + ' flex-1'} value={pf.task.issueTypes} onChange={(e) => setPf({ ...pf, task: { ...pf.task, issueTypes: e.target.value } })} placeholder="Task, Story, Sub-task, Bug" />
                  <select className={sel} value={pf.task.parent.kind} onChange={(e) => setPf({ ...pf, task: { ...pf.task, parent: { ...pf.task.parent, kind: e.target.value as ProfileForm['task']['parent']['kind'] } } })}>
                    <option value="epic-link">epic link</option>
                    <option value="issue-link">issue link</option>
                    <option value="parent">parent</option>
                  </select>
                </div>
                {pf.task.parent.kind === 'issue-link' && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <input className={input + ' flex-1'} placeholder="link type" value={pf.task.parent.linkType ?? ''} onChange={(e) => setPf({ ...pf, task: { ...pf.task, parent: { ...pf.task.parent, linkType: e.target.value } } })} />
                    <select className={sel} value={pf.task.parent.direction ?? 'outward'} onChange={(e) => setPf({ ...pf, task: { ...pf.task, parent: { ...pf.task.parent, direction: e.target.value as 'inward' | 'outward' } } })}>
                      <option value="outward">outward</option>
                      <option value="inward">inward</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <div className={label}>Epic Link custom field id (DC; optional)</div>
                <input className={input} value={pf.epicLinkFieldId ?? ''} onChange={(e) => setPf({ ...pf, epicLinkFieldId: e.target.value })} placeholder="customfield_10014" />
              </div>

              {/* Milestone */}
              <label className="flex items-center gap-2 text-xs text-[#5b6573]">
                <input type="checkbox" checked={pf.milestone.enabled} onChange={(e) => setPf({ ...pf, milestone: { ...pf.milestone, enabled: e.target.checked } })} />
                Track milestones
              </label>
              {pf.milestone.enabled && (
                <div className="flex items-center gap-2">
                  <input className={input + ' flex-1'} placeholder="Milestone issue types" value={pf.milestone.issueTypes} onChange={(e) => setPf({ ...pf, milestone: { ...pf.milestone, issueTypes: e.target.value } })} />
                  <input className={input + ' flex-1'} placeholder="link type (includes)" value={pf.milestone.linkType} onChange={(e) => setPf({ ...pf, milestone: { ...pf.milestone, linkType: e.target.value } })} />
                </div>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-[#8b95a3]">The acceptance-criteria source is what the coverage check depends on. See docs/sample-profile.json.</p>
        </div>

        {(save.isError || formError) && <p className="text-xs text-[#dc2626]">{formError ?? (save.error as Error).message}</p>}

        <div className="flex items-center gap-2">
          <button disabled={!name || save.isPending} onClick={() => save.mutate()} className="h-9 flex-1 rounded bg-[#0f766e] text-sm font-semibold text-white disabled:opacity-50">
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
          </button>
          {editing && <button onClick={() => del.mutate()} className="h-9 rounded border border-[#dc2626] px-3 text-sm font-semibold text-[#dc2626]">Delete</button>}
        </div>
      </div>
    </div>
  );
}
