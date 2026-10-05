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
import {
  normalizeImageForRead,
  resolveMediaCategory,
  transcodeImageToSupportedFormat,
} from './imageFormat.js';
import { processSingleFileContent } from './fileUtils.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';

// Run this file alone on Termux. Do not import sharp in the test: a missing
// native addon must not block ordinary module evaluation or text-only work.
describe('image resize optional-native startup boundary', () => {
  it('imports the actual file reading tool graph without initializing sharp', () => {
    expect(typeof processSingleFileContent).toBe('function');
    expect(typeof ReadFileTool).toBe('function');
    expect(typeof ReadManyFilesTool).toBe('function');
    expect(resolveMediaCategory('image/png')?.type).toBe('image');
  });

  it('passes through supported vision formats without the native sharp addon', async () => {
    const bytes = Buffer.from('image bytes are untouched by MIME passthrough');
    const transcoded = await transcodeImageToSupportedFormat(bytes, 'image/png');
    expect(transcoded).toBe(bytes);
    const normalized = await normalizeImageForRead(
      bytes,
      'image/png',
      'passthrough.png',
      undefined,
    );
    expect(normalized?.buffer).toBe(bytes);
    expect(normalized?.mimeType).toBe('image/png');
  });


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
