/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors, SemanticColors } from '../colors.js';
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
    <Box flexDirection="column" paddingLeft={1}>
      <Text color={maw.ember} bold>FIELD NOTES</Text>
      <Text color={SemanticColors.text.secondary}>
        <Text color={maw.iron}>TRACK</Text>  Inspect the cause, not just the symptom.
      </Text>
      <Text color={SemanticColors.text.secondary}>
        <Text color={maw.iron}>FORGE</Text>  Change the code. Run the checks.
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={SemanticColors.text.secondary}>
          <Text color={maw.ember}>/help</Text> commands  /  <Text color={maw.ember}>/model</Text> select a model
        </Text>
        <Text color={SemanticColors.text.secondary}>
          {hasWorkspaceInstructions
            ? 'Workspace instructions detected (LLXPRT.md).'
            : 'Add LLXPRT.md for repository-specific instructions.'}
        </Text>
      </Box>
    </Box>
  );
};
