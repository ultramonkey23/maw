/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThoughtSummary } from '@vybestack/llxprt-code-core';
import type React from 'react';
import { Box, Text } from 'ink';
import type { SpinnerName } from 'cli-spinners';
import { SemanticColors } from '../colors.js';
import { getMawPalette } from './mawPalette.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { RespondingSpinner } from './RespondingSpinner.js';
import { formatDuration } from '../utils/formatters.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';
import { firstNonEmptyString } from '../../utils/coalesce.js';

/**
 * Format timer text for display.
 */
function formatTimerText(elapsedTime: number): string {
  return elapsedTime < 60
    ? `${elapsedTime}s`
    : formatDuration(elapsedTime * 1000);
}

type ActivityClass = 'approval' | 'shell' | 'response';

function classifyActivity(
  streamingState: StreamingState,
  isShellFocusHint: boolean,
): ActivityClass {
  if (streamingState === StreamingState.WaitingForConfirmation) {
    return 'approval';
  }
  if (isShellFocusHint) {
    return 'shell';
  }
  return 'response';
}

function resolvePrimaryText(
  isShellFocusHint: boolean,
  isActionRequired: boolean,
  currentLoadingPhrase: string | undefined,
  thoughtSubject: string | undefined,
): string | undefined {
  if (isShellFocusHint) {
    return 'Interactive shell: press tab to focus shell';
  }
  if (isActionRequired) {
    return currentLoadingPhrase;
  }
  return firstNonEmptyString(thoughtSubject, currentLoadingPhrase);
}

const ACTIVITY_LABELS: Record<ActivityClass, string> = {
  approval: 'APPROVAL',
  shell: 'SHELL',
  response: 'RESPONSE',
};

const ACTIVITY_COLORS: Record<ActivityClass, string> = {
  approval: SemanticColors.status.warning,
  shell: SemanticColors.text.accent,
  response: getMawPalette().ember,
};

// Each live state gets its own motion motif: soft breathing for reasoning,
// a mechanical tick when the shell holds focus, an arrow when the user is
// the one who must act.
const SPINNER_MOTIFS: Record<ActivityClass, SpinnerName> = {
  approval: 'arrow3',
  shell: 'toggle',
  response: 'dots',
};

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
  thought,
}) => {
  const streamingState = useStreamingContext();

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  const hasRightContent = Boolean(rightContent);
  const isShellFocusHint =
    currentLoadingPhrase === INTERACTIVE_SHELL_WAITING_PHRASE;
  const isActionRequired =
    streamingState === StreamingState.WaitingForConfirmation ||
    isShellFocusHint;
  const activityClass = classifyActivity(streamingState, isShellFocusHint);
  // Prioritize the complete keyboard instruction over a decorative timer.
  // The full canonical hint is longer than the available width on narrower
  // terminals, so use a compact equivalent only for this exact shell state.
  const primaryText = resolvePrimaryText(
    isShellFocusHint,
    isActionRequired,
    currentLoadingPhrase,
    thought?.subject,
  );

  const timerText = isActionRequired
    ? ''
    : ` (esc to cancel, ${formatTimerText(elapsedTime)})`;

  const lineText = primaryText
    ? `${primaryText}${timerText}`
    : timerText.trimStart();
  // Describe the state we actually know. Waiting for permission and a focused
  // shell are distinct from a normal response stream.
  const activityLabel = ACTIVITY_LABELS[activityClass];
  const labelColor = ACTIVITY_COLORS[activityClass];
  const spinnerMotif = SPINNER_MOTIFS[activityClass];

  return (
    <Box marginTop={1} paddingLeft={0} flexDirection="column">
      {/* Main loading line */}
      <Box width="100%" flexDirection="row">
        <Box marginRight={1}>
          <RespondingSpinner
            spinnerType={spinnerMotif}
            nonRespondingDisplay={
              streamingState === StreamingState.WaitingForConfirmation
                ? '⠏'
                : ''
            }
          />
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row">
          <Text bold color={labelColor}>
            {activityLabel}{' '}
          </Text>
          {lineText && (
            <Text
              color={SemanticColors.text.primary}
              wrap={timerText ? 'truncate-middle' : 'truncate-end'}
            >
              {lineText}
            </Text>
          )}
        </Box>
        {}
        {hasRightContent ? (
          <Box marginLeft={1} flexShrink={0}>
            {rightContent}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};
