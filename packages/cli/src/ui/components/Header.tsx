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
  let renderedTitle: React.ReactNode;
  if (isCustom && Colors.GradientColors) {
    renderedTitle = (
      <ThemedGradient colors={Colors.GradientColors}>
        <Text color={Colors.Foreground}>{displayTitle}</Text>
      </ThemedGradient>
    );
  } else if (isCustom) {
    renderedTitle = (
      <Text color={SemanticColors.text.accent}>{displayTitle}</Text>
    );
  } else {
    const lineColors = [maw.iron, maw.bone, maw.spectral];
    renderedTitle = displayTitle.split('\n').map((line, index) => (
      <Text key={index} bold color={lineColors[index] ?? maw.spectral}>
        {line}
      </Text>
    ));
  }

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      {renderedTitle}
      {!isCustom && terminalWidth >= getAsciiArtWidth(shortAsciiLogo) && (
        <Box paddingLeft={1} flexDirection="row">
          <Text bold color={maw.ember}>
            EVOLVE CODE
          </Text>
          {isWide && (
            <Text
              color={maw.spectral}
            >{` // ${maw.style} / FORGE / PROVE`}</Text>
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
