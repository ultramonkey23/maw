/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import {
  resolveImageResizePolicy,
  resizeImageIfNeeded,
} from './imageResize.js';

// Run this file alone on Termux. Do not import sharp in the test: a missing
// native addon must not block ordinary module evaluation or text-only work.
describe('image resize optional-native startup boundary', () => {
  it('loads policy helpers without initializing sharp', () => {
    expect(resolveImageResizePolicy({})).toBeUndefined();
    expect(
      resolveImageResizePolicy({ 'image-resize.enabled': false }),
    ).toBeUndefined();
  });

  it('does not initialize sharp for an unconfigured resize', async () => {
    const original = Buffer.from('unchanged input');
    const actual = await resizeImageIfNeeded(
      original,
      'image/png',
      'untouched.png',
    );
    expect(actual).toBe(original);
  });
});
