/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import { ToolCallStatus } from '../types.js';
import { buildToolStatusTally } from './toolStatusTally.js';

describe('buildToolStatusTally', () => {
  it('returns empty string when there is nothing to summarize', () => {
    expect(buildToolStatusTally([])).toBe('');
    expect(buildToolStatusTally([ToolCallStatus.Success])).toBe('');
    expect(buildToolStatusTally([ToolCallStatus.Executing])).toBe('');
  });

  it('groups repeated statuses into one glyph-count segment', () => {
    expect(
      buildToolStatusTally([
        ToolCallStatus.Success,
        ToolCallStatus.Success,
        ToolCallStatus.Success,
      ]),
    ).toBe('✓3');
    expect(
      buildToolStatusTally([
        ToolCallStatus.Executing,
        ToolCallStatus.Executing,
        ToolCallStatus.Pending,
      ]),
    ).toBe('⊷2 o1');
  });

  it('orders segments severity-first so failures cannot hide behind successes', () => {
    expect(
      buildToolStatusTally([
        ToolCallStatus.Success,
        ToolCallStatus.Pending,
        ToolCallStatus.Error,
        ToolCallStatus.Success,
        ToolCallStatus.Canceled,
        ToolCallStatus.Error,
      ]),
    ).toBe('x2 -1 o1 ✓2');
  });

  it('keeps confirmation states visible ahead of running work', () => {
    expect(
      buildToolStatusTally([
        ToolCallStatus.Executing,
        ToolCallStatus.Confirming,
        ToolCallStatus.Success,
      ]),
    ).toBe('?1 ⊷1 ✓1');
  });
});
