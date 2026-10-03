/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { fuzzyReplace } from './fuzzy-replacer.js';

describe('MAW fuzzy editing preserves replacement source text', () => {
  it('keeps literal Python escape sequences after an exact match', () => {
    const source = 'message = "old"\n';
    const replacement = String.raw`message = "new\n\t"`;
    expect(fuzzyReplace(source, 'message = "old"', replacement)).toEqual({
      result: replacement + '\n',
      occurrences: 1,
    });
  });

  it('normalizes the search text without unescaping the replacement text', () => {
    const source = 'alpha\nbeta\n';
    const escapedSearch = String.raw`alpha\nbeta`;
    const replacement = String.raw`text = "alpha\nbeta"`;
    expect(fuzzyReplace(source, escapedSearch, replacement)).toEqual({
      result: replacement + '\n',
      occurrences: 1,
    });
  });

  it('preserves literal Windows path separators and escaped quotes', () => {
    const source = 'path = "old"\n';
    const replacement = String.raw`path = "C:\tools\new" + "\"quoted\""`;
    expect(fuzzyReplace(source, 'path = "old"', replacement)).toEqual({
      result: replacement + '\n',
      occurrences: 1,
    });
  });
});
