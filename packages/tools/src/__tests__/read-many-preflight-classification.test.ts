/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  shouldResizeExplicitImage,
} from '../utils/fileUtils.js';
import {
  checkAssetFileRequested,
} from '../utils/fileBudgetChecks.js';

describe('read_many_files preflight classification reuse', () => {
  it('uses a supplied image classification for resize policy without re-probing the path', async () => {
    const missingPath = '/definitely-missing-maw-fixture/photo.png';

    expect(
      await shouldResizeExplicitImage(
        missingPath,
        ['photo.png'],
        true,
        'image',
      ),
    ).toBe(true);
  });

  it('uses a supplied classification for the asset-request gate', async () => {
    const skipped: Array<{ path: string; reason: string }> = [];

    const result = await checkAssetFileRequested(
      '/definitely-missing-maw-fixture/photo.png',
      'photo.png',
      ['*.txt'],
      skipped,
      'image',
    );

    expect(result).toBe('skip');
    expect(skipped).toStrictEqual([
      {
        path: 'photo.png',
        reason:
          'asset file (image/pdf/audio) was not explicitly requested by name or extension',
      },
    ]);
  });

  it('classifies once inside the read-many preflight gate sequence', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../utils/fileBudgetChecks.ts', import.meta.url)),
      'utf8',
    );
    const start = source.indexOf('export async function runPreReadGates(');
    expect(start).toBeGreaterThanOrEqual(0);
    const endMarker =
      "return { outcome: 'proceed', resizeBeforeOutputLimit };\n}";
    const end = source.indexOf(endMarker, start);
    expect(end).toBeGreaterThan(start);
    const functionSource = source.slice(start, end + endMarker.length);
    const classificationCalls =
      functionSource.match(/detectFileType\(filePath\)/g) ?? [];

    expect(classificationCalls).toHaveLength(1);
    expect(functionSource).toMatch(
      /shouldResizeExplicitImage\(\s*filePath,\s*inputPatterns,\s*hasResizePolicy,\s*detectedFileType,/,
    );
    expect(functionSource).toMatch(
      /checkAssetFileRequested\(\s*filePath,\s*relativePathForDisplay,\s*inputPatterns,\s*skippedFiles,\s*detectedFileType,/,
    );
  });
});
