/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugLogger } from '@vybestack/llxprt-code-telemetry';
import { spawnSync } from 'node:child_process';
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

function looksLikeLabRoot(candidate: string): boolean {
  return (
    existsSync(join(candidate, 'AGENTS.md')) &&
    existsSync(join(candidate, 'labctl')) &&
    existsSync(join(candidate, 'tools', 'lab_mcp_server.py'))
  );
}

function addLabCandidate(
  candidates: string[],
  seen: Set<string>,
  candidate: string | undefined,
): void {
  const value = candidate?.trim();
  if (!value) return;
  const absolute = resolve(value);
  const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(absolute);
}

interface LabPythonCommand {
  command: string;
  prefixArgs: string[];
}

function canRunLabPython(candidate: LabPythonCommand): boolean {
  try {
    const result = spawnSync(
      candidate.command,
      [...candidate.prefixArgs, '--version'],
      {
        stdio: 'ignore',
        timeout: 5000,
        windowsHide: true,
      },
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

function resolveLabPythonCommand(): LabPythonCommand {
  const explicit = process.env['MAW_LAB_PYTHON']?.trim();
  if (explicit) {
    return { command: explicit, prefixArgs: [] };
  }

  const candidates: LabPythonCommand[] =
    process.platform === 'win32'
      ? [
          { command: 'py', prefixArgs: ['-3'] },
          { command: 'python', prefixArgs: [] },
          { command: 'python3', prefixArgs: [] },
        ]
      : [
          { command: 'python', prefixArgs: [] },
          { command: 'python3', prefixArgs: [] },
        ];

  return (
    candidates.find(canRunLabPython) ?? {
      command: 'python',
      prefixArgs: [],
    }
  );
}

function findLabRoot(): string | undefined {
  // MAW's explicit override is authoritative. If it is wrong, fail visibly
  // instead of silently attaching some other checkout.
  const explicit = process.env['MAW_LAB_ROOT']?.trim();
  if (explicit) {
    const candidate = resolve(explicit);
    return looksLikeLabRoot(candidate) ? candidate : undefined;
  }

  const cwd = resolve(process.cwd());
  // Match the Lab's canonical resolver: an invocation whose cwd is itself the
  // Lab root is an explicit local selection and wins over environment hints.
  if (looksLikeLabRoot(cwd)) return cwd;

  const candidates: string[] = [];
  const seen = new Set<string>();

  // Reuse the Lab's own established root signals before fallback guesses.
  // ULTRAMONKEYDOG_LAB_ROOT is the canonical Lab pathing override;
  // LAB_ROOT/LAB_DIR are used by existing Lab launchers and Termux setup.
  for (const name of [
    'ULTRAMONKEYDOG_LAB_ROOT',
    'LAB_ROOT',
    'LAB_DIR',
  ] as const) {
    addLabCandidate(candidates, seen, process.env[name]);
  }

  // If no canonical environment selected a checkout, preserve MAW's useful
  // ancestor discovery for callers working somewhere inside a Lab checkout.
  let current = dirname(cwd);
  for (;;) {
    addLabCandidate(candidates, seen, current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  addLabCandidate(candidates, seen, homedir());
  addLabCandidate(candidates, seen, join(homedir(), 'ultramonkeydog-lab'));

  return candidates.find(looksLikeLabRoot);
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
  const python = resolveLabPythonCommand();
  return {
    ...withoutLab,
    lab: {
      command: python.command,
      args: [
        ...python.prefixArgs,
        join(root, 'tools', 'lab_mcp_server.py'),
      ],
      cwd: root,
      env: { PYTHONIOENCODING: 'utf-8' },
      timeout: 600000,
      // This is an explicit private Lab attachment, not a public endpoint.
      // Workspace trust and Lab-owned effect authority remain separate.
      // No includeTools filter: let MCP discover the complete canonical registry.
      trust: true,
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
