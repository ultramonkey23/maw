/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { fuzzyReplace, levenshtein, BlockAnchorReplacer } from './fuzzy-replacer.js';

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

describe('MAW Levenshtein memory-scaled correctness', () => {
  it('handles empty and identical strings', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('', 'alpha')).toBe(5);
    expect(levenshtein('alpha', '')).toBe(5);
    expect(levenshtein('alpha', 'alpha')).toBe(0);
  });

  it('preserves insertion, substitution, deletion and symmetry', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('sitting', 'kitten')).toBe(3);
    expect(levenshtein('abcd', 'abXd')).toBe(1);
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  it('handles highly unequal line lengths in either direction', () => {
    const long = 'a'.repeat(8192);
    const short = 'a'.repeat(16);
    expect(levenshtein(long, short)).toBe(8176);
    expect(levenshtein(short, long)).toBe(8176);
  });
});

describe('MAW single-candidate block safety', () => {
  it('does not edit unrelated code just because boundary lines match', () => {
    const actual = ['function launch() {', '  DELETE_ALL_TABLES();', '}'].join('\n');
    const expected = ['function launch() {', '  return approvedPlan;', '}'].join('\n');
    expect([...BlockAnchorReplacer(actual, expected)]).toEqual([]);
    expect(fuzzyReplace(actual, expected, 'changed')).toBeNull();
  });

  it('retains useful fuzzy recovery for a nearly matching middle line', () => {
    const actual = ['function launch() {', '  return counter + 11;', '}'].join('\n');
    const expected = ['function launch() {', '  return counter + 10;', '}'].join('\n');
    expect([...BlockAnchorReplacer(actual, expected)]).toEqual([actual]);
  });

  it('does not reject an unmodified anchored block', () => {
    const block = ['function launch() {', '  return counter + 10;', '}'].join('\n');
    expect([...BlockAnchorReplacer(block, block)]).toEqual([block]);
  });
});
