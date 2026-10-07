/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import { buildRipgrepArgs } from '../tools/ripGrep.js';

describe('ripgrep host scaling', () => {
  it('delegates thread-count selection to ripgrep instead of capping MAW at four workers', () => {
    const args = buildRipgrepArgs('needle', '/workspace', undefined, {
      respectGitIgnore: true,
      respectLlxprtIgnore: true,
      llxprtIgnoreFilePath: null,
    });

    const threadFlag = args.indexOf('--threads');
    expect(threadFlag).toBeGreaterThanOrEqual(0);
    expect(args[threadFlag + 1]).toBe('0');
    expect(args).not.toContain('4');
  });
});
