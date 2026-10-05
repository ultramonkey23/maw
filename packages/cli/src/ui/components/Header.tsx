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
  // Include the signature width when choosing the wide crown. Earlier the
  // jaw art fitted while the longer slogan wrapped inside a narrower Box.
  const wideSignature = ` // ${maw.style} / FORGE / PROVE`;
  const wideFooterWidth = 'EVOLVE CODE'.length + wideSignature.length;
  const isWide =
    terminalWidth >=
    Math.max(getAsciiArtWidth(longAsciiLogo), wideFooterWidth) + 2;
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
  const artWidth = Math.max(
    getAsciiArtWidth(displayTitle),
    !isCustom && terminalWidth >= getAsciiArtWidth(shortAsciiLogo)
      ? isWide
        ? wideFooterWidth
        : 'EVOLVE CODE'.length
      : 0,
  );
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
    const lineColors = [
      maw.ember,
      maw.iron,
      maw.spectral,
      maw.bone,
      maw.iron,
      maw.ember,
      maw.spectral,
    ];
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
        <Box flexDirection="row">
          <Text bold color={maw.ember}>
            EVOLVE CODE
          </Text>
          {isWide && (
            <Text color={maw.spectral}>{wideSignature}</Text>
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
