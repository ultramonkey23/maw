/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugLogger } from '@vybestack/llxprt-code-telemetry';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type {
  MCPServerConfig,
  LlxprtExtension,
} from '@vybestack/llxprt-code-core';
import type { Settings } from './settings.js';
import type { ContextResolutionResult } from './interactiveContext.js';

const logger = new DebugLogger('llxprt:config:mcpServerConfig');

const LAB_TOOLS = [
  'status',
  'workspace',
  'capability_manifest',
  'partner_identity',
  'project_entry',
  'execution_proof',
  'llxprt_chassis',
];

function findLabRoot(): string | undefined {
  const explicit = process.env['MAW_LAB_ROOT'];
  const candidates: string[] = explicit
    ? [explicit]
    : [homedir(), join(homedir(), 'ultramonkeydog-lab')];
  if (!explicit) {
    let current = resolve(process.cwd());
    for (;;) {
      candidates.push(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return candidates.find(
    (candidate) =>
      existsSync(join(candidate, 'AGENTS.md')) &&
      existsSync(join(candidate, 'labctl')) &&
      existsSync(join(candidate, 'tools', 'lab_mcp_server.py')),
  );
}

function applyMawLabMode(
  servers: Record<string, MCPServerConfig>,
  labAllowed: boolean,
): Record<string, MCPServerConfig> {
  const mode = process.env['MAW_LAB_MODE'];
  if (mode !== 'on' && mode !== 'off') return servers;
  const withoutLab = Object.fromEntries(
    Object.entries(servers).filter(([name]) => name !== 'lab'),
  );
  if (mode === 'off' || !labAllowed) return withoutLab;
  const root = findLabRoot();
  if (!root) {
    logger.debug('MAW Lab root unavailable; continuing without Lab MCP.');
    return withoutLab;
  }
  return {
    ...withoutLab,
    lab: {
      command: process.env['MAW_LAB_PYTHON'] ?? 'python',
      args: [join(root, 'tools', 'lab_mcp_server.py')],
      cwd: root,
      env: { PYTHONIOENCODING: 'utf-8' },
      timeout: 600000,
      trust: false,
      includeTools: LAB_TOOLS,
    },
  };
}

export function mergeMcpServers(
  settings: Settings,
  extensions: LlxprtExtension[],
): Record<string, MCPServerConfig> {
  const mcpServers = { ...(settings.mcpServers ?? {}) };
  for (const extension of extensions) {
    Object.entries(extension.mcpServers ?? {}).forEach(([key, server]) => {
      const existingServer = (
        mcpServers as Partial<Record<string, MCPServerConfig>>
      )[key];
      if (existingServer !== undefined) {
        logger.debug(
          () =>
            `WARNING: Skipping extension MCP config for server with key "${key}" as it already exists.`,
        );
        return;
      }
      mcpServers[key] = {
        ...server,
        extensionName: extension.name,
      };
    });
  }
  return mcpServers;
}

export function allowedMcpServers(
  mcpServers: Record<string, MCPServerConfig>,
  allowMCPServers: string[],
  blockedMcpServers: Array<{ name: string; extensionName: string }>,
): Record<string, MCPServerConfig> {
  const allowedNames = new Set(allowMCPServers.filter(Boolean));
  if (allowedNames.size > 0) {
    return Object.fromEntries(
      Object.entries(mcpServers).filter(([key, server]) => {
        const isAllowed = allowedNames.has(key);
        if (!isAllowed) {
          blockedMcpServers.push({
            name: key,
            extensionName: server.extensionName ?? '',
          });
        }
        return isAllowed;
      }),
    );
  }
  blockedMcpServers.push(
    ...Object.entries(mcpServers).map(([key, server]) => ({
      name: key,
      extensionName: server.extensionName ?? '',
    })),
  );
  return {};
}

export function resolveMcpServers(
  profileMergedSettings: Settings,
  context: ContextResolutionResult,
  allowedMcpServerNames: string[] | undefined,
): {
  mcpServers: Record<string, MCPServerConfig>;
  blockedMcpServers: Array<{ name: string; extensionName: string }>;
} {
  let mcpServers = mergeMcpServers(
    profileMergedSettings,
    context.activeExtensions,
  );
  const blockedMcpServers: Array<{ name: string; extensionName: string }> = [];

  if (!allowedMcpServerNames) {
    if (profileMergedSettings.allowMCPServers) {
      mcpServers = allowedMcpServers(
        mcpServers,
        profileMergedSettings.allowMCPServers,
        blockedMcpServers,
      );
    }
    if (profileMergedSettings.excludeMCPServers) {
      const excludedNames = new Set(
        profileMergedSettings.excludeMCPServers.filter(Boolean),
      );
      if (excludedNames.size > 0) {
        blockedMcpServers.push(
          ...Object.entries(mcpServers)
            .filter(([key]) => excludedNames.has(key))
            .map(([key, server]) => ({
              name: key,
              extensionName: server.extensionName ?? '',
            })),
        );
        mcpServers = Object.fromEntries(
          Object.entries(mcpServers).filter(([key]) => !excludedNames.has(key)),
        );
      }
    }
  }
  if (allowedMcpServerNames) {
    mcpServers = allowedMcpServers(
      mcpServers,
      allowedMcpServerNames,
      blockedMcpServers,
    );
  }

  const allowedByCli =
    allowedMcpServerNames === undefined ||
    allowedMcpServerNames.includes('lab');
  const allowedByProfile =
    profileMergedSettings.allowMCPServers === undefined ||
    profileMergedSettings.allowMCPServers.includes('lab');
  const excludedByProfile =
    profileMergedSettings.excludeMCPServers?.includes('lab') === true;
  return {
    mcpServers: applyMawLabMode(
      mcpServers,
      allowedByCli && allowedByProfile && !excludedByProfile,
    ),
    blockedMcpServers,
  };
}
