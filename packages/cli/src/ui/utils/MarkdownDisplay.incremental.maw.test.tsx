/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import stripAnsi from 'strip-ansi';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { render, wrapWithProviders } from '../../__tests__/render.js';

type RenderOptions = {
  isPending?: boolean;
  availableTerminalHeight?: number;
};

const frameOf = (text: string, options: RenderOptions = {}): string => {
  const { lastFrame } = render(
    wrapWithProviders(
      <MarkdownDisplay
        text={text}
        isPending={options.isPending ?? false}
        availableTerminalHeight={options.availableTerminalHeight}
        terminalWidth={40}
      />,
    ),
  );
  return stripAnsi(lastFrame() ?? '');
};

const streamedFrameOf = (
  earlierText: string,
  fullText: string,
  options: RenderOptions = {},
): string => {
  const { lastFrame, rerender } = render(
    wrapWithProviders(
      <MarkdownDisplay
        text={earlierText}
        isPending={options.isPending ?? false}
        availableTerminalHeight={options.availableTerminalHeight}
        terminalWidth={40}
      />,
    ),
  );
  rerender(
    wrapWithProviders(
      <MarkdownDisplay
        text={fullText}
        isPending={options.isPending ?? false}
        availableTerminalHeight={options.availableTerminalHeight}
        terminalWidth={40}
      />,
    ),
  );
  return stripAnsi(lastFrame() ?? '');
};

describe('<MarkdownDisplay /> incremental streaming parse', () => {
  it('renders appended paragraphs identically to a fresh render', () => {
    const earlier = 'Alpha paragraph.\n\nBeta paragraph.';
    const full = `${earlier}\n\nGamma paragraph.`;
    expect(streamedFrameOf(earlier, full)).toBe(frameOf(full));
  });

  it('renders a code block that grew before closing identically to a fresh render', () => {
    const earlier = 'Intro\n\n```js\nconst a = 1;';
    const full = 'Intro\n\n```js\nconst a = 1;\nconst b = 2;\n```';
    expect(streamedFrameOf(earlier, full)).toBe(frameOf(full));
  });

  it('renders appends after a closed code block identically to a fresh render', () => {
    const earlier = '```js\nconst a = 1;\n```\n\nAfter.';
    const full = `${earlier}\n\nMore text.`;
    expect(streamedFrameOf(earlier, full)).toBe(frameOf(full));
  });

  it('lets a table separator arriving later take over the trailing row', () => {
    const earlier = 'Intro\n\n| a | b |';
    const full = 'Intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(streamedFrameOf(earlier, full)).toBe(frameOf(full));
  });

  it('renders appended headers, quotes and lists identically to a fresh render', () => {
    const earlier = '# Title\n\n> quoted line\n\n- item one';
    const full =
      '# Title\n\n> quoted line\n> quoted again\n\n- item one\n- item two\n\n## Section';
    expect(streamedFrameOf(earlier, full)).toBe(frameOf(full));
  });

  it('falls back to a full parse when earlier text is replaced instead of extended', () => {
    const earlier = 'Alpha paragraph.';
    const full = 'Completely different.';
    expect(streamedFrameOf(earlier, full)).toBe(frameOf(full));
  });

  it('keeps pending code truncation identical to a fresh render', () => {
    const earlier = '```js\nconst a = 1;';
    const full =
      '```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;';
    expect(
      streamedFrameOf(earlier, full, {
        isPending: true,
        availableTerminalHeight: 6,
      }),
    ).toBe(frameOf(full, { isPending: true, availableTerminalHeight: 6 }));
  });
});
