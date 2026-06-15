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

import { create } from 'zustand';
import type { GroupMode } from '@criterio/shared';

// UI state for the canvas: which subtrees are expanded, which issue is selected (drives the
// inspector at P5), and how epics are grouped. Kept out of React Flow so layout recompute is cheap.
interface MindmapState {
  expanded: Set<string>;
  selected: string | null;
  groupMode: GroupMode;
  toggle: (key: string) => void;
  setExpanded: (keys: string[]) => void;
  select: (key: string | null) => void;
  setGroupMode: (mode: GroupMode) => void;
}

export const useMindmap = create<MindmapState>((set) => ({
  expanded: new Set<string>(),
  selected: null,
  groupMode: 'none',
  toggle: (key) =>
    set((s) => {
      const e = new Set(s.expanded);
      if (e.has(key)) e.delete(key);
      else e.add(key);
      return { expanded: e };
    }),
  setExpanded: (keys) => set({ expanded: new Set(keys) }),
  select: (key) => set({ selected: key }),
  setGroupMode: (mode) => set({ groupMode: mode }),
}));
