/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { Colors } from '../../colors.js';
import { getMawPalette } from '../mawPalette.js';
import {
  RESPONSE_RAIL,
  SCREEN_READER_MODEL_PREFIX,
} from '../../textConstants.js';
import { ThinkingBlockDisplay } from './ThinkingBlockDisplay.js';
import type { ThinkingBlock } from '@vybestack/llxprt-code-core';
import { useRuntimeApi } from '../../contexts/RuntimeContext.js';
import { useTerminalStore } from '../../stores/terminal/TerminalContext.js';
import { useStoreSelector } from '../../stores/useStoreSelector.js';
import { useResolvedWorkspaceDirectories } from '../../hooks/useResolvedWorkspaceDirectories.js';

interface AiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  model?: string;
  profileName?: string;
  thinkingBlocks?: ThinkingBlock[]; // @plan:PLAN-20251202-THINKING-UI.P06
  workspaceDirectories?: readonly string[];
}

export function getVisibleThinkingBlocks(
  showThinking: boolean,
  thinkingBlocks?: ThinkingBlock[],
): ThinkingBlock[] | undefined {
  if (!showThinking) {
    return undefined;
  }
  return thinkingBlocks?.filter((block) => block.isHidden !== true);
}

export const AiMessage: React.FC<AiMessageProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
  model,
  profileName,
  thinkingBlocks,
  workspaceDirectories,
}) => {
  /**
   * @plan:PLAN-20251202-THINKING-UI.P06
   * @requirement:REQ-THINK-UI-001
   * @requirement:REQ-THINK-UI-003
   */
  const { getEphemeralSetting } = useRuntimeApi();
  const showThinking = (getEphemeralSetting('reasoning.includeInResponse') ??
    true) as boolean;
  const { store } = useTerminalStore();
  const renderMarkdown = useStoreSelector(store, (s) => s.renderMarkdown);
  const resolvedWorkspaceDirectories =
    useResolvedWorkspaceDirectories(workspaceDirectories);

  // A quiet, persistent visual rail separates agent output from boxed user input.
  const prefix = RESPONSE_RAIL;
  const prefixWidth = prefix.length;

  // #1723: Show thinking blocks in BOTH pending and committed items so thinking
  // content streams in real-time. The LoadingIndicator still shows the transient
  // thought subject, but the growing thinking block is now visible below it.
  const visibleThinkingBlocks = getVisibleThinkingBlocks(
    showThinking,
    thinkingBlocks,
  );

  const identityLine = [profileName ? `[${profileName}]` : '', model ?? '']
    .filter((part) => part.length > 0)
    .join(' · ');

  return (
    <Box flexDirection="column">
      {identityLine.length > 0 && (
        <Box marginBottom={0}>
          <Text color={Colors.DimComment}>{identityLine}</Text>
        </Box>
      )}
      {visibleThinkingBlocks?.map((block, index) => (
        <ThinkingBlockDisplay
          key={`thinking-${index}`}
          block={block}
          visible={true}
        />
      ))}
      <Box flexDirection="row">
        <Box width={prefixWidth}>
          <Text
            color={getMawPalette().bone}
            aria-label={SCREEN_READER_MODEL_PREFIX}
          >
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <MarkdownDisplay
            text={text}
            isPending={isPending}
            availableTerminalHeight={availableTerminalHeight}
            terminalWidth={terminalWidth}
            renderMarkdown={renderMarkdown}
            workspaceDirectories={resolvedWorkspaceDirectories}
          />
        </Box>
      </Box>
    </Box>
  );
};
