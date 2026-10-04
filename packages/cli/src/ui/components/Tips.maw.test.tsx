/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { render } from '../../__tests__/render.js';
import type { MemoryState } from '../cliUiRuntime.js';
import { Tips } from './Tips.js';

const memoryWith = (count: number): MemoryState =>
  ({ getLlxprtMdFileCount: () => count }) as MemoryState;

describe('MAW field notes', () => {
  it('shows useful work cues without legacy Gemini branding', () => {
    const frame = render(<Tips memory={memoryWith(0)} />).lastFrame() ?? '';
    expect(frame).toContain('FIELD NOTES');
    expect(frame).toContain('TRACK');
    expect(frame).toContain('FORGE');
    expect(frame).toContain('/help');
    expect(frame).toContain('/model');
    expect(frame).toContain('Add LLXPRT.md');
    expect(frame).not.toContain('Gemini');
  });

  it('respects repository instructions already detected', () => {
    const frame = render(<Tips memory={memoryWith(2)} />).lastFrame() ?? '';
    expect(frame).toContain('Workspace instructions detected');
    expect(frame).not.toContain('Add LLXPRT.md');
  });
});
