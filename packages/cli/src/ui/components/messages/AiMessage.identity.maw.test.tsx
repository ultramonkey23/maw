/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { describe, it, expect, vi } from 'bun:test';
import stripAnsi from 'strip-ansi';
import { AiMessage } from './AiMessage.js';
import { RESPONSE_RAIL } from '../../textConstants.js';
import { renderWithProviders } from '../../../__tests__/render.js';
import { Colors } from '../../colors.js';

void vi.mock('../../contexts/RuntimeContext.js', () => ({
  useRuntimeApi: () => ({
    getEphemeralSetting: () => true,
  }),
  useRuntimeBridge: () => ({
    runtimeId: 'test',
    metadata: {},
    api: { getEphemeralSetting: () => true },
    runWithScope: <T,>(cb: () => T) => cb(),
    enterScope: () => {},
  }),
  RuntimeContextProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  getRuntimeBridge: () => ({
    runtimeId: 'test',
    metadata: {},
    api: { getEphemeralSetting: () => true },
    runWithScope: <T,>(cb: () => T) => cb(),
    enterScope: () => {},
  }),
  getRuntimeApi: () => ({ getEphemeralSetting: () => true }),
}));

void vi.mock('../../utils/MarkdownDisplay.js', () => ({
  MarkdownDisplay: function MockMarkdownDisplay({
    text,
  }: {
    text: string;
    isPending: boolean;
  }) {
    return <Text color={Colors.Foreground}>MockMarkdown:{text}</Text>;
  },
}));

void vi.mock('./ThinkingBlockDisplay.js', () => ({
  ThinkingBlockDisplay: () => null,
}));

describe('<AiMessage /> MAW role identity', () => {
  const baseProps = {
    text: 'Hello, world!',
    isPending: false,
    terminalWidth: 80,
  };

  it('keeps profile and model together on a single identity line', () => {
    const { lastFrame } = renderWithProviders(
      <AiMessage
        {...baseProps}
        profileName="active-model"
        model="gemini-pro"
      />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    const identityLines = frame
      .split('\n')
      .filter(
        (line) => line.includes('active-model') || line.includes('gemini-pro'),
      );
    expect(identityLines).toHaveLength(1);
    expect(identityLines[0]).toContain('[active-model]');
    expect(identityLines[0]).toContain('gemini-pro');
  });

  it('renders the response spine rail before the message content', () => {
    const { lastFrame } = renderWithProviders(
      <AiMessage {...baseProps} model="gemini-pro" />,
    );
    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain(`${RESPONSE_RAIL}MockMarkdown:Hello, world!`);
  });
});
