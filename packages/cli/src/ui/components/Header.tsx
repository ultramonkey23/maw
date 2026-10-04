/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors, SemanticColors } from '../colors.js';
import { getMawPalette } from './mawPalette.js';
import { shortAsciiLogo, longAsciiLogo } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { ThemedGradient } from './ThemedGradient.js';

interface HeaderProps {
  customAsciiArt?: string; // Preserve custom user art exactly.
  terminalWidth: number;
  version: string;
  nightly: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  terminalWidth,
  version,
  nightly,
}) => {
  const isCustom = Boolean(customAsciiArt);
  const maw = getMawPalette();
  const isWide = terminalWidth >= getAsciiArtWidth(longAsciiLogo) + 2;
  let displayTitle: string;
  if (customAsciiArt) {
    displayTitle = customAsciiArt;
  } else if (isWide) {
    displayTitle = longAsciiLogo;
  } else if (terminalWidth >= getAsciiArtWidth(shortAsciiLogo)) {
    displayTitle = shortAsciiLogo;
  } else {
    displayTitle = 'MAW';
  }
  const artWidth = getAsciiArtWidth(displayTitle);

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      {isCustom && Colors.GradientColors ? (
        <ThemedGradient colors={Colors.GradientColors}>
          <Text color={Colors.Foreground}>{displayTitle}</Text>
        </ThemedGradient>
      ) : (
        <Text
          bold={!isCustom}
          color={isCustom ? SemanticColors.text.accent : maw.iron}
        >
          {displayTitle}
        </Text>
      )}
      {!isCustom && terminalWidth >= getAsciiArtWidth(shortAsciiLogo) && (
        <Box paddingLeft={1} flexDirection="row">
          <Text bold color={maw.ember}>
            LIVING CODE
          </Text>
          {isWide && (
            <Text color={maw.bone}>{' // TRACE / FORGE / PROVE'}</Text>
          )}
        </Box>
      )}
      {nightly && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          <Text color={SemanticColors.text.secondary}>v{version}</Text>
        </Box>
      )}
    </Box>
  );
};
