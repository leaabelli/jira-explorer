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

// MCP server, stdio transport — for local LLM clients (Claude Desktop / Claude Code).
// Domain tools (get_hierarchy, get_requirement_coverage, update_epic, transition_issue, sync)
// are registered in P7, wrapping the same engine the REST server uses.
//
// Note: logs go to stderr — stdout is reserved for the MCP protocol stream.
console.error('[jira-explorer] MCP stdio entry — domain tools land in P7');
