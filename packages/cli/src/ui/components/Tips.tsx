/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { SemanticColors } from '../colors.js';
import { getMawPalette } from './mawPalette.js';
import type { MemoryState } from '../cliUiRuntime.js';

interface TipsProps {
  memory: MemoryState;
}

/**
 * The idle welcome is a field guide, not a claim that the Lab is running.
 * MAW works independently; repository instructions are loaded by LLxprt.
 */
export const Tips: React.FC<TipsProps> = ({ memory }) => {
  const hasWorkspaceInstructions = memory.getLlxprtMdFileCount() > 0;
  const maw = getMawPalette();
  return (
    <Box flexDirection="column" paddingLeft={0}>
      <Text color={maw.ember} bold>
        {'[ THE HUNT // FIELD NOTES ]'}
      </Text>
      <Box flexDirection="column" paddingLeft={1}>
        <Text color={SemanticColors.text.secondary}>
          <Text bold color={maw.spectral}>TRACK / </Text>Find the real cause.
        </Text>
        <Text color={SemanticColors.text.secondary}>
          <Text bold color={maw.iron}>FORGE / </Text>Make the smallest correct change.
        </Text>
        <Text color={SemanticColors.text.secondary}>
          <Text bold color={maw.ember}>PROVE / </Text>Observe the result. Keep the learning.
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={SemanticColors.text.secondary}>
          <Text color={maw.ember}>/help</Text> commands /{' '}
          <Text color={maw.ember}>/model</Text> select a model
        </Text>
        <Text color={SemanticColors.text.secondary}>
          {hasWorkspaceInstructions
            ? 'Workspace instructions detected (LLXPRT.md).'
            : 'Add LLXPRT.md for repository-specific instructions.'}
        </Text>
        {process.env['MAW_LAB_MODE'] === 'on' && (
          <Text color={maw.spectral}>
            LAB REQUESTED /mcp shows live connection health
          </Text>
        )}
      </Box>
    </Box>
  );
};
