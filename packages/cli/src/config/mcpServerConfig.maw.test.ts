/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'bun:test';
import type { Settings } from './settings.js';
import type { ContextResolutionResult } from './interactiveContext.js';
import { resolveMcpServers } from './mcpServerConfig.js';

const originalMode = process.env['MAW_LAB_MODE'];
const originalRoot = process.env['MAW_LAB_ROOT'];
const settings = {
  mcpServers: {
    lab: { command: 'python', args: ['tools/lab_mcp_server.py'] },
    other: { command: 'other-mcp' },
  },
} as Settings;
const context = { activeExtensions: [] } as unknown as ContextResolutionResult;

describe('MAW Lab attachment boundary', () => {
  afterEach(() => {
    if (originalMode === undefined) delete process.env['MAW_LAB_MODE'];
    else process.env['MAW_LAB_MODE'] = originalMode;
    if (originalRoot === undefined) delete process.env['MAW_LAB_ROOT'];
    else process.env['MAW_LAB_ROOT'] = originalRoot;
  });
  it('keeps ordinary MCP while standalone MAW omits Lab', () => {
    process.env['MAW_LAB_MODE'] = 'off';
    const { mcpServers } = resolveMcpServers(settings, context, undefined);
    expect(Object.keys(mcpServers)).toStrictEqual(['other']);
  });

  it('does not invent a Lab connection when the requested root is absent', () => {
    process.env['MAW_LAB_MODE'] = 'on';
    process.env['MAW_LAB_ROOT'] = 'this-path-does-not-exist';
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
