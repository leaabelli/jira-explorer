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

// P0 placeholder: proves the web app boots and the /api proxy reaches the server.
// The mindmap canvas (built to DESIGN.md) lands at P4.
export function App() {
  const [health, setHealth] = useState('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) =>
        setHealth(`ok · v${d.version} · jira ${d.jiraConfigured ? 'configured' : 'not set'}`),
      )
      .catch(() => setHealth('server unreachable'));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] font-sans text-[#1a1d21]">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Jira Explorer</h1>
        <p className="mt-2 text-sm text-[#5b6573]">API: {health}</p>
        <p className="mt-6 text-xs text-[#8b95a3]">P0 scaffold · mindmap lands at P4</p>
      </div>
    </div>
  );
}
