/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { Colors } from '../colors.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { describe, expect, it, vi } from 'bun:test';

// Mock RespondingSpinner
void vi.mock('./RespondingSpinner.js', () => ({
  RespondingSpinner: ({
    nonRespondingDisplay,
  }: {
    nonRespondingDisplay?: string;
  }) => {
    const streamingState = React.useContext(StreamingContext)!;
    if (streamingState === StreamingState.Responding) {
      return <Text color={Colors.Foreground}>MockRespondingSpinner</Text>;
    } else if (nonRespondingDisplay) {
      return <Text color={Colors.Foreground}>{nonRespondingDisplay}</Text>;
    }
    return null;
  },
}));

const renderWithContext = (
  ui: React.ReactElement,
  streamingStateValue: StreamingState,
) => {
  const contextValue: StreamingState = streamingStateValue;
  return render(
    <StreamingContext.Provider value={contextValue}>
      {ui}
    </StreamingContext.Provider>,
  );
};

describe('<LoadingIndicator />', () => {
  const defaultProps = {
    currentLoadingPhrase: 'Loading...',
    elapsedTime: 5,
  };

  describe('MAW live status', () => {
    it('labels a real response without suggesting tool execution', () => {
      const frame =
        renderWithContext(
          <LoadingIndicator
            currentLoadingPhrase="Reading context"
            elapsedTime={3}
          />,
          StreamingState.Responding,
        ).lastFrame() ?? '';
      expect(frame).toContain('RESPONSE');
      expect(frame).toContain('Reading context');
      expect(frame).not.toContain('APPROVAL');
    });

    it('makes approval visibly distinct and avoids a misleading cancel timer', () => {
      const frame =
        renderWithContext(
          <LoadingIndicator
            currentLoadingPhrase="Confirm change"
            elapsedTime={3}
          />,
          StreamingState.WaitingForConfirmation,
        ).lastFrame() ?? '';
      expect(frame).toContain('APPROVAL');
      expect(frame).toContain('Confirm change');
      expect(frame).not.toContain('esc to cancel');
    });

    it('labels interactive shell focus instead of reasoning', () => {
      const frame =
        renderWithContext(
          <LoadingIndicator
            currentLoadingPhrase={INTERACTIVE_SHELL_WAITING_PHRASE}
            elapsedTime={3}
          />,
          StreamingState.Responding,
        ).lastFrame() ?? '';
      expect(frame).toContain('SHELL');
      expect(frame).not.toContain('APPROVAL');
    });
  });

  it('should not render when streamingState is Idle', () => {
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Idle,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render spinner, phrase, and time when streamingState is Responding', () => {
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toContain('MockRespondingSpinner');
    expect(output).toContain('Loading...');
    expect(output).toContain('(esc to cancel, 5s)');
  });

  it('should render spinner (static), phrase but no time/cancel when streamingState is WaitingForConfirmation', () => {
    const props = {
      currentLoadingPhrase: 'Confirm action',
      elapsedTime: 10,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.WaitingForConfirmation,
    );
    const output = lastFrame();
    expect(output).toContain('⠏'); // Static char for WaitingForConfirmation
    expect(output).toContain('Confirm action');
    expect(output).not.toContain('(esc to cancel)');
    expect(output).not.toContain(', 10s');
  });

  it('should display the currentLoadingPhrase correctly', () => {
    const props = {
      currentLoadingPhrase: 'Processing data...',
      elapsedTime: 3,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('Processing data...');
  });

  it('should display the elapsedTime correctly when Responding', () => {
    const props = {
      currentLoadingPhrase: 'Working...',
      elapsedTime: 60,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('(esc to cancel, 1m)');
  });

  it('should display the elapsedTime correctly in human-readable format', () => {
    const props = {
      currentLoadingPhrase: 'Working...',
      elapsedTime: 125,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('(esc to cancel, 2m 5s)');
  });

  it('should render rightContent when provided', () => {
    const rightContent = <Text color={Colors.Foreground}>Extra Info</Text>;
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...defaultProps} rightContent={rightContent} />,
      StreamingState.Responding,
    );
    expect(lastFrame()).toContain('Extra Info');
  });

  it('should transition correctly between states using rerender', () => {
    const { lastFrame, rerender } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Idle,
    );
    expect(lastFrame()).toBe(''); // Initial: Idle

    // Transition to Responding
    rerender(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <LoadingIndicator
          currentLoadingPhrase="Now Responding"
          elapsedTime={2}
        />
      </StreamingContext.Provider>,
    );
    let output = lastFrame();
    expect(output).toContain('MockRespondingSpinner');
    expect(output).toContain('Now Responding');
    expect(output).toContain('(esc to cancel, 2s)');

    // Transition to WaitingForConfirmation
    rerender(
      <StreamingContext.Provider value={StreamingState.WaitingForConfirmation}>
        <LoadingIndicator
          currentLoadingPhrase="Please Confirm"
          elapsedTime={15}
        />
      </StreamingContext.Provider>,
    );
    output = lastFrame();
    expect(output).toContain('⠏');
    expect(output).toContain('Please Confirm');
    expect(output).not.toContain('(esc to cancel)');
    expect(output).not.toContain(', 15s');

    // Transition back to Idle
    rerender(
      <StreamingContext.Provider value={StreamingState.Idle}>
        <LoadingIndicator {...defaultProps} />
      </StreamingContext.Provider>,
    );
    expect(lastFrame()).toBe('');
  });

  it('should display fallback phrase if thought is empty', () => {
    const props = {
      thought: null,
      currentLoadingPhrase: 'Loading...',
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toContain('Loading...');
  });

  it('should display the subject of a thought', () => {
    const props = {
      thought: {
        subject: 'Thinking about something...',
        description: 'and other stuff.',
      },
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).not.toBeNull();
    expect(output).toContain('Thinking about something...');
    expect(output).not.toContain('and other stuff.');
  });

  it('should prioritize thought.subject over currentLoadingPhrase', () => {
    const props = {
      thought: {
        subject: 'This should be displayed',
        description: 'A description',
      },
      currentLoadingPhrase: 'This should not be displayed',
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    expect(output).toContain('This should be displayed');
    expect(output).not.toContain('This should not be displayed');
  });

  it('should truncate long primary text instead of wrapping', () => {
    const { lastFrame } = renderWithContext(
      <LoadingIndicator
        {...defaultProps}
        currentLoadingPhrase={
          'This is an extremely long loading phrase that should be truncated in the UI to keep the primary line concise.'
        }
      />,
      StreamingState.Responding,
    );

    const output = lastFrame();
    // A separate MAW state label now uses some columns. The text should
    // retain a useful prefix and the cancel timer, not require an exact
    // number of characters before Ink's width-aware ellipsis.
    expect(output).toContain('This is an extremely long loading');
    expect(output).toContain('(esc to cancel, 5s)');
    expect(output).toContain('…');
  });

  it('should prioritize action-required phrase over thought.subject when WaitingForConfirmation', () => {
    const props = {
      thought: {
        subject: 'Some thought subject',
        description: 'A description',
      },
      currentLoadingPhrase: 'Waiting for user confirmation...',
      elapsedTime: 10,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.WaitingForConfirmation,
    );
    const output = lastFrame();
    expect(output).toContain('Waiting for user confirmation...');
    expect(output).not.toContain('Some thought subject');
  });

  it('should prioritize shell focus hint phrase over thought.subject', () => {
    const props = {
      thought: {
        subject: 'Some thought subject',
        description: 'A description',
      },
      currentLoadingPhrase:
        'Interactive shell awaiting input... press tab to focus shell',
      elapsedTime: 5,
    };
    const { lastFrame } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    const output = lastFrame();
    // The phrase may be truncated by MaxSizedBox width constraints, but the
    // key parts of the shell-focus hint must be present.
    expect(output).toContain('Interactive shell');
    expect(output).toContain('tab to focus shell');
    expect(output).not.toContain('esc to cancel');
    expect(output).not.toContain('Some thought subject');
  });
});
