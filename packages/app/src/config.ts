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

// Runtime config from env. Secrets (PAT) come from env; the SQLite cache lives in dataDir.
export interface AppConfig {
  port: number;
  dataDir: string;
  /** secret used to encrypt stored PATs at rest (keep it OUT of the data volume) */
  encryptionKey: string;
  /** optional env-seeded default connection (creates a "Default" project on first run) */
  jira: { baseUrl?: string; pat?: string };
  mcp: { allowWrite: boolean; applyToJira: boolean };
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    dataDir: process.env.DATA_DIR ?? './data',
    encryptionKey: process.env.ENCRYPTION_KEY ?? 'dev-insecure-key-change-me',
    jira: { baseUrl: process.env.JIRA_BASE_URL, pat: process.env.JIRA_PAT },
    mcp: {
      allowWrite: process.env.MCP_ALLOW_WRITE !== 'false',
      applyToJira: process.env.MCP_APPLY_TO_JIRA === 'true',
    },
  };
}
