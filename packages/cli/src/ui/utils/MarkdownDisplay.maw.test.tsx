/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'bun:test';
import stripAnsi from 'strip-ansi';
import { MarkdownDisplay } from './MarkdownDisplay.js';
import { renderWithProviders } from '../../__tests__/render.js';

describe('<MarkdownDisplay /> MAW signal-spine hierarchy', () => {
  const baseProps = {
    isPending: false,
    terminalWidth: 40,
    availableTerminalHeight: 24,
  };

  it('renders h1 with the full spine block marker', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text="# Deep Title" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('█ Deep Title');
  });

  it('renders h2 with the half spine block marker', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text="## Section Title" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('▌ Section Title');
  });

  it('keeps h3 as bold body text without a spine marker', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text="### Sub Title" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Sub Title');
    expect(frame).not.toContain('█ Sub Title');
    expect(frame).not.toContain('▌ Sub Title');
  });

  it('renders blockquote lines with a quarter-block marginal gutter', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text="> the old law still stands" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('▎ the old law still stands');
  });

  it('keeps the blockquote gutter on every line of a multi-line quote', () => {
    const text = '> first line of the quote\n> second line of the quote';
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('▎ first line of the quote');
    expect(frame).toContain('▎ second line of the quote');
  });

  it('renders horizontal rules as a real horizontal rule of terminal width', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text={'before\n---\nafter'} />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    const expectedRule = '─'.repeat(baseProps.terminalWidth - 2);
    expect(frame).toContain(expectedRule);
    expect(frame).not.toContain('---');
  });

  it('renders inline markdown inside blockquotes', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text="> quote with **bold** inside" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('▎ quote with bold inside');
  });

  it('does not mistake a plain greater-than phrase for a quote without the marker space', () => {
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text="a > b is a comparison" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('a > b is a comparison');
    expect(frame).not.toContain('▎');
  });

  it('leaves code blocks, lists and tables untouched', () => {
    const text = [
      '- bullet keeps its marker',
      '',
      '```',
      'code keeps its indent',
      '```',
    ].join('\n');
    const { lastFrame } = renderWithProviders(
      <MarkdownDisplay {...baseProps} text={text} />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('- bullet keeps its marker');
    expect(frame).toContain(' code keeps its indent');
    expect(frame).not.toContain('█');
  });
});
