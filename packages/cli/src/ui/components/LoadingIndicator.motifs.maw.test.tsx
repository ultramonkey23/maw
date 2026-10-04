/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, expect, it, vi } from 'bun:test';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { Colors } from '../colors.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';

type CapturedSpinnerProps = {
  spinnerType?: string;
  nonRespondingDisplay?: string;
};

const capturedSpinnerProps: CapturedSpinnerProps[] = [];

void vi.mock('./RespondingSpinner.js', () => ({
  RespondingSpinner: (props: CapturedSpinnerProps) => {
    capturedSpinnerProps.push(props);
    return <Text color={Colors.Foreground}>MockRespondingSpinner</Text>;
  },
}));

const renderWithContext = (
  ui: React.ReactElement,
  streamingStateValue: StreamingState,
) =>
  render(
    <StreamingContext.Provider value={streamingStateValue}>
      {ui}
    </StreamingContext.Provider>,
  );

describe('<LoadingIndicator /> spinner motifs', () => {
  const lastSpinner = (): CapturedSpinnerProps => {
    const props = capturedSpinnerProps.at(-1);
    if (!props) {
      throw new Error('no spinner was rendered');
    }
    return props;
  };

  it('streams a breathing dots motif while responding', () => {
    capturedSpinnerProps.length = 0;
    renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="Reading context"
        elapsedTime={3}
      />,
      StreamingState.Responding,
    );
    expect(lastSpinner().spinnerType).toBe('dots');
  });

  it('ticks with the mechanical toggle motif while the shell holds focus', () => {
    capturedSpinnerProps.length = 0;
    renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase={INTERACTIVE_SHELL_WAITING_PHRASE}
        elapsedTime={3}
      />,
      StreamingState.Responding,
    );
    expect(lastSpinner().spinnerType).toBe('toggle');
  });

  it('aims an arrow motif at the user while an approval is pending', () => {
    capturedSpinnerProps.length = 0;
    renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="Confirm change"
        elapsedTime={3}
      />,
      StreamingState.WaitingForConfirmation,
    );
    expect(lastSpinner().spinnerType).toBe('arrow3');
  });
});
