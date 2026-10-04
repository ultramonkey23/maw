/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'bun:test';
import stripAnsi from 'strip-ansi';
import { AiMessageContent } from './AiMessageContent.js';
import { RESPONSE_RAIL } from '../../textConstants.js';
import { renderWithProviders } from '../../../__tests__/render.js';

// The real hook resolves workspace directories through the CLI runtime scope,
// which this component test does not establish; the passthrough keeps the
// component's rendering contract intact.
void vi.mock('../../hooks/useResolvedWorkspaceDirectories.js', () => ({
  useResolvedWorkspaceDirectories: (dirs?: readonly string[]) => dirs ?? [],
}));

describe('<AiMessageContent /> MAW continuation spine', () => {
  const baseProps = {
    text: 'continuation text keeps flowing',
    isPending: false,
    terminalWidth: 80,
  };

  it('marks a continuation chunk with the same response rail as the head chunk', () => {
    const { lastFrame } = renderWithProviders(
      <AiMessageContent {...baseProps} />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    const [firstLine] = frame.split('\n');
    expect(firstLine.startsWith(RESPONSE_RAIL)).toBe(true);
    expect(frame).toContain('continuation text keeps flowing');
  });

  it('derives its content indentation from the rail width, not a phantom prefix', () => {
    const { lastFrame } = renderWithProviders(
      <AiMessageContent {...baseProps} />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    const [firstLine] = frame.split('\n');
    expect(firstLine.startsWith(RESPONSE_RAIL)).toBe(true);
  });

  it('passes markdown content through the continued chunk renderer', () => {
    const { lastFrame } = renderWithProviders(
      <AiMessageContent {...baseProps} text={'## continued heading'} />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('continued heading');
  });
});
