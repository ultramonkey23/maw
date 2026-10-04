/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../semantic-colors.js';
import { RenderInline } from './InlineMarkdownRenderer.js';

// Signal-spine hierarchy: block width encodes rank (full block = h1, half
// block = h2, quarter block = quote marginalia).
export const HEADER_MARKER_H1 = '█ ';
export const HEADER_MARKER_H2 = '▌ ';
export const QUOTE_GUTTER = '▎ ';
export const HR_CHAR = '─';
export const QUOTE_GUTTER_WIDTH = 2;
export const HR_MIN_WIDTH = 8;
export const HR_EDGE_PADDING = 2;

export function renderHeaderNode(
  headerMatch: RegExpMatchArray,
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
): React.ReactNode {
  const level = headerMatch[1].length;
  const headerText = headerMatch[2];
  switch (level) {
    case 1:
      return (
        <Box flexDirection="row">
          <Text color={theme.text.link} bold>
            {HEADER_MARKER_H1}
          </Text>
          <RenderInline
            text={headerText}
            defaultColor={theme.text.link}
            bold
            workspaceDirectories={workspaceDirectories}
          />
        </Box>
      );
    case 2:
      return (
        <Box flexDirection="row">
          <Text color={theme.text.link} bold>
            {HEADER_MARKER_H2}
          </Text>
          <RenderInline
            text={headerText}
            defaultColor={theme.text.link}
            bold
            workspaceDirectories={workspaceDirectories}
          />
        </Box>
      );
    case 3:
      return (
        <RenderInline
          text={headerText}
          defaultColor={responseColor}
          bold
          workspaceDirectories={workspaceDirectories}
        />
      );
    case 4:
      return (
        <RenderInline
          text={headerText}
          defaultColor={theme.text.secondary}
          italic
          workspaceDirectories={workspaceDirectories}
        />
      );
    default:
      return (
        <RenderInline
          text={headerText}
          defaultColor={responseColor}
          workspaceDirectories={workspaceDirectories}
        />
      );
  }
}

export function renderHrBlock(
  key: string,
  terminalWidth: number,
): React.ReactNode {
  const ruleLength = Math.max(HR_MIN_WIDTH, terminalWidth - HR_EDGE_PADDING);
  return (
    <Box key={key}>
      <Text color={theme.ui.comment}>{HR_CHAR.repeat(ruleLength)}</Text>
    </Box>
  );
}

export function renderQuoteBlock(
  key: string,
  quoteText: string,
  workspaceDirectories: readonly string[] | undefined,
): React.ReactNode {
  return (
    <Box key={key} flexDirection="row">
      <Box width={QUOTE_GUTTER_WIDTH}>
        <Text color={theme.ui.comment}>{QUOTE_GUTTER}</Text>
      </Box>
      <Box flexGrow={1}>
        <RenderInline
          text={quoteText}
          defaultColor={theme.text.secondary}
          wrap="wrap"
          workspaceDirectories={workspaceDirectories}
        />
      </Box>
    </Box>
  );
}

export function renderHeaderBlock(
  key: string,
  headerMatch: RegExpMatchArray,
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
): React.ReactNode {
  return (
    <Box key={key}>
      {renderHeaderNode(headerMatch, responseColor, workspaceDirectories)}
    </Box>
  );
}

export function renderParagraphBlock(
  key: string,
  line: string,
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
): React.ReactNode {
  return (
    <Box key={key}>
      <RenderInline
        text={line}
        defaultColor={responseColor}
        wrap="wrap"
        workspaceDirectories={workspaceDirectories}
      />
    </Box>
  );
}
