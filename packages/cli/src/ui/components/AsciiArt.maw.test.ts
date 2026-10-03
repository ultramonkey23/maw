/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { longAsciiLogo, shortAsciiLogo } from './AsciiArt.js';

describe('MAW responsive terminal identity', () => {
  it('has distinct compact and wide MAW headings', () => {
    expect(shortAsciiLogo).toContain('MAW');
    expect(longAsciiLogo).toContain('MAW');
    expect(getAsciiArtWidth(longAsciiLogo)).toBeGreaterThan(
      getAsciiArtWidth(shortAsciiLogo),
    );
  });

  it('fits compact terminals without escape sequences or wide Unicode glyphs', () => {
    expect(getAsciiArtWidth(shortAsciiLogo)).toBeLessThanOrEqual(24);
    for (const logo of [shortAsciiLogo, longAsciiLogo]) {
      expect(logo).not.toMatch(/[\u001b\u007f]/);
      expect([...logo].every((character) => character.charCodeAt(0) <= 127)).toBe(true);
    }
  });
});
