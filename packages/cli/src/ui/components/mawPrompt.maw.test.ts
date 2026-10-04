/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { theme } from '../semantic-colors.js';
import { getMawPalette } from './mawPalette.js';
import { getMawPromptBorderColor } from './inputPromptRender.js';

describe('MAW composer focus cues', () => {
  it('uses MAW iron only when the normal input is focused', () => {
    expect(getMawPromptBorderColor(false, true)).toBe(getMawPalette().iron);
    expect(getMawPromptBorderColor(false, false)).toBe(theme.border.default);
  });

  it('keeps shell input unmistakable even when focused', () => {
    expect(getMawPromptBorderColor(true, true)).toBe(theme.status.warning);
    expect(getMawPromptBorderColor(true, false)).toBe(theme.status.warning);
  });
});
