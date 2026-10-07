/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Settings } from './settings.js';
import type { ContextResolutionResult } from './interactiveContext.js';
import { resolveMcpServers } from './mcpServerConfig.js';

const trackedEnv = [
  'MAW_LAB_MODE',
  'MAW_LAB_ROOT',
  'MAW_LAB_PYTHON',
  'ULTRAMONKEYDOG_LAB_ROOT',
  'LAB_ROOT',
  'LAB_DIR',
] as const;
const originalEnv = Object.fromEntries(
  trackedEnv.map((name) => [name, process.env[name]]),
) as Record<(typeof trackedEnv)[number], string | undefined>;
const originalCwd = process.cwd();
const tempRoots: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function makeLabRoot(prefix = 'maw-lab-root-'): string {
  const root = makeTempDir(prefix);
  mkdirSync(join(root, 'tools'));
  for (const path of ['AGENTS.md', 'labctl', 'tools/lab_mcp_server.py']) {
    writeFileSync(join(root, path), '');
  }
  return root;
}
const settings = {
  mcpServers: {
    lab: { command: 'python', args: ['tools/lab_mcp_server.py'] },
    other: { command: 'other-mcp' },
  },
} as Settings;
const context = { activeExtensions: [] } as unknown as ContextResolutionResult;

describe('MAW Lab attachment boundary', () => {
  beforeEach(() => {
    // Keep attachment tests deterministic; interpreter auto-discovery has its
    // own production path while these cases focus on root/authority behavior.
    process.env['MAW_LAB_PYTHON'] = 'python';
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const name of trackedEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps ordinary MCP while standalone MAW omits Lab', () => {
    process.env['MAW_LAB_MODE'] = 'off';
    const { mcpServers } = resolveMcpServers(settings, context, undefined);
    expect(Object.keys(mcpServers)).toStrictEqual(['other']);
  });

  it('attaches the complete canonical Lab MCP surface with no client-side seven-tool cap', () => {
    const root = makeLabRoot('maw-lab-tools-');
    process.env['MAW_LAB_MODE'] = 'on';
    process.env['MAW_LAB_ROOT'] = root;
    const { mcpServers } = resolveMcpServers(settings, context, undefined);
    expect(Object.keys(mcpServers)).toStrictEqual(['lab', 'other']);
    const lab = mcpServers['lab'];
    expect(lab?.command).toBe('python');
    expect(lab?.cwd).toBe(root);
    expect(lab?.args).toStrictEqual([join(root, 'tools', 'lab_mcp_server.py')]);
    expect(lab?.env?.['MAW_WORKSPACE_ROOT']).toBe(process.cwd());
    expect(lab?.trust).toBe(true);
    expect(lab?.includeTools).toBeUndefined();
    expect(lab?.excludeTools).toBeUndefined();
    expect(lab?.url).toBeUndefined();
  });


  it('keeps an explicit MAW_LAB_PYTHON authoritative', () => {
    const root = makeLabRoot('maw-python-override-');
    process.env['MAW_LAB_MODE'] = 'on';
    process.env['MAW_LAB_ROOT'] = root;
    process.env['MAW_LAB_PYTHON'] = '/custom/python';

    const { mcpServers } = resolveMcpServers(settings, context, undefined);

    expect(mcpServers['lab']?.command).toBe('/custom/python');
    expect(mcpServers['lab']?.args).toStrictEqual([
      join(root, 'tools', 'lab_mcp_server.py'),
    ]);
  });

  it('does not invent a Lab connection when the requested root is absent', () => {
    process.env['MAW_LAB_MODE'] = 'on';
    process.env['MAW_LAB_ROOT'] = 'this-path-does-not-exist';
    const { mcpServers } = resolveMcpServers(settings, context, undefined);
    expect(Object.keys(mcpServers)).toStrictEqual(['other']);
  });


  it('uses the canonical Lab root environment from an unrelated repository', () => {
    const root = makeLabRoot('maw-canonical-lab-');
    const workspace = makeTempDir('maw-unrelated-repo-');
    process.chdir(workspace);
    process.env['MAW_LAB_MODE'] = 'on';
    delete process.env['MAW_LAB_ROOT'];
    process.env['ULTRAMONKEYDOG_LAB_ROOT'] = root;

    const { mcpServers } = resolveMcpServers(settings, context, undefined);

    expect(mcpServers['lab']?.cwd).toBe(root);
    expect(mcpServers['lab']?.args).toStrictEqual([
      join(root, 'tools', 'lab_mcp_server.py'),
    ]);
    expect(mcpServers['lab']?.env?.['MAW_WORKSPACE_ROOT']).toBe(workspace);
  });

  it('lets the canonical Lab environment outrank an ancestor checkout', () => {
    const ancestorLab = makeLabRoot('maw-ancestor-lab-');
    const canonicalLab = makeLabRoot('maw-canonical-env-lab-');
    const nested = join(ancestorLab, 'projects', 'target');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);
    process.env['MAW_LAB_MODE'] = 'on';
    delete process.env['MAW_LAB_ROOT'];
    process.env['ULTRAMONKEYDOG_LAB_ROOT'] = canonicalLab;

    const { mcpServers } = resolveMcpServers(settings, context, undefined);

    expect(mcpServers['lab']?.cwd).toBe(canonicalLab);
  });

  it('lets an exact Lab-root cwd outrank the canonical environment hint', () => {
    const cwdLab = makeLabRoot('maw-exact-cwd-lab-');
    const canonicalLab = makeLabRoot('maw-other-canonical-lab-');
    process.chdir(cwdLab);
    process.env['MAW_LAB_MODE'] = 'on';
    delete process.env['MAW_LAB_ROOT'];
    process.env['ULTRAMONKEYDOG_LAB_ROOT'] = canonicalLab;

    const { mcpServers } = resolveMcpServers(settings, context, undefined);

    expect(mcpServers['lab']?.cwd).toBe(cwdLab);
  });

  it.each([
    ['LAB_ROOT', 'maw-lab-root-env-'],
    ['LAB_DIR', 'maw-lab-dir-env-'],
  ] as const)(
    'reuses the Lab launcher environment %s from an unrelated repository',
    (name, prefix) => {
      const root = makeLabRoot(prefix);
      const workspace = makeTempDir('maw-other-workspace-');
      process.chdir(workspace);
      process.env['MAW_LAB_MODE'] = 'on';
      delete process.env['MAW_LAB_ROOT'];
      delete process.env['ULTRAMONKEYDOG_LAB_ROOT'];
      delete process.env['LAB_ROOT'];
      delete process.env['LAB_DIR'];
      process.env[name] = root;

      const { mcpServers } = resolveMcpServers(settings, context, undefined);

      expect(mcpServers['lab']?.cwd).toBe(root);
    },
  );

  it('keeps an explicit MAW_LAB_ROOT authoritative even when another Lab root is valid', () => {
    const fallback = makeLabRoot('maw-fallback-lab-');
    const workspace = makeTempDir('maw-explicit-root-workspace-');
    process.chdir(workspace);
    process.env['MAW_LAB_MODE'] = 'on';
    process.env['MAW_LAB_ROOT'] = join(workspace, 'missing-explicit-root');
    process.env['ULTRAMONKEYDOG_LAB_ROOT'] = fallback;

    const { mcpServers } = resolveMcpServers(settings, context, undefined);

    expect(Object.keys(mcpServers)).toStrictEqual(['other']);
  });

  it('leaves ordinary LLxprt MCP settings alone', () => {
    delete process.env['MAW_LAB_MODE'];
    const { mcpServers } = resolveMcpServers(settings, context, undefined);
    expect(Object.keys(mcpServers)).toStrictEqual(['lab', 'other']);
  });

  it('respects an explicit MCP server allow list in Lab mode', () => {
    process.env['MAW_LAB_MODE'] = 'on';
    const { mcpServers } = resolveMcpServers(settings, context, ['other']);
    expect(Object.keys(mcpServers)).toStrictEqual(['other']);
  });
});
