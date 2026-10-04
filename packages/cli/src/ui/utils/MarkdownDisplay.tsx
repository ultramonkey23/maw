/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../semantic-colors.js';
import { appendCodeBlockLine } from './codeBlockAccumulator.js';
import { colorizeCode } from './CodeColorizer.js';
import { TableRenderer } from './TableRenderer.js';
import { RenderInline } from './InlineMarkdownRenderer.js';
import { useSettings } from '../contexts/SettingsContext.js';
import {
  renderHeaderBlock,
  renderHrBlock,
  renderParagraphBlock,
  renderQuoteBlock,
} from './markdownBlocks.js';
import type {
  CodeBlockState,
  IncrementalParseCache,
  ParseSpan,
  ProcessLinesResult,
} from './markdownParseIncremental.js';
import { parseMarkdownIncremental } from './markdownParseIncremental.js';
import type {
  LineMatchResult,
  MarkdownRegexes,
} from './markdownLineMatching.js';
import { MARKDOWN_REGEXES, matchLine } from './markdownLineMatching.js';

interface MarkdownDisplayProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderMarkdown?: boolean;
  workspaceDirectories?: readonly string[];
}

// Constants for Markdown parsing and rendering

const EMPTY_LINE_HEIGHT = 1;
const CODE_BLOCK_PREFIX_PADDING = 1;
const LIST_ITEM_PREFIX_PADDING = 1;
const LIST_ITEM_TEXT_FLEX_GROW = 1;

const MarkdownDisplayInternal: React.FC<MarkdownDisplayProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
  renderMarkdown = true,
  workspaceDirectories,
}) => {
  const settings = useSettings();
  const responseColor = theme.text.response;
  const incrementalCacheRef = React.useRef<IncrementalParseCache | null>(null);

  if (!text) return <></>;

  if (!renderMarkdown) {
    const colorizedMarkdown = colorizeCode(
      text,
      'markdown',
      availableTerminalHeight,
      terminalWidth - CODE_BLOCK_PREFIX_PADDING,
      undefined,
      settings,
      true,
    );
    return (
      <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
        {colorizedMarkdown}
      </Box>
    );
  }

  const lines = text.split(/\r?\n/);
  const regexes = MARKDOWN_REGEXES;
  const paramsKey = [
    isPending ? 'pending' : 'complete',
    availableTerminalHeight ?? 'auto',
    terminalWidth,
    responseColor,
    JSON.stringify(workspaceDirectories ?? null),
  ].join('\u0000');
  const { contentBlocks } = parseMarkdownIncremental(
    incrementalCacheRef,
    lines,
    paramsKey,
    (startLine, lastLineEmptyBefore) =>
      processLines(
        lines,
        regexes,
        isPending,
        availableTerminalHeight,
        terminalWidth,
        responseColor,
        workspaceDirectories,
        startLine,
        lastLineEmptyBefore,
      ),
  );

  return <>{contentBlocks}</>;
};
function handleCodeBlockLine(
  line: string,
  index: number,
  codeBlockFence: string,
  regexes: MarkdownRegexes,
  isPending: boolean,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
  codeBlockContent: string[],
  codeBlockLang: string | null,
  codeBlockStartIndex: number,
  emitBlock: (
    block: React.ReactNode,
    startLine: number,
    endLine: number,
  ) => void,
): CodeBlockState {
  const fenceMatch = line.match(regexes.codeFenceRegex);
  if (
    fenceMatch !== null &&
    fenceMatch[1].startsWith(codeBlockFence[0]) &&
    fenceMatch[1].length >= codeBlockFence.length
  ) {
    emitBlock(
      <RenderCodeBlock
        key={`line-${index}`}
        content={codeBlockContent}
        lang={codeBlockLang}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />,
      codeBlockStartIndex,
      index,
    );
    return {
      inCodeBlock: false,
      codeBlockContent: [],
      codeBlockLang: null,
      codeBlockFence: '',
      codeBlockStartIndex: -1,
    };
  }
  appendCodeBlockLine(
    codeBlockContent,
    line,
    isPending,
    availableTerminalHeight,
  );
  return {
    inCodeBlock: true,
    codeBlockContent,
    codeBlockLang,
    codeBlockFence,
    codeBlockStartIndex,
  };
}

function processLineEntry(
  line: string,
  index: number,
  lines: string[],
  regexes: MarkdownRegexes,
  isPending: boolean,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
  codeBlockState: CodeBlockState,
  inTable: boolean,
  tableHeaders: string[],
  tableRows: string[][],
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
  emitBlock: (
    block: React.ReactNode,
    startLine: number,
    endLine: number,
  ) => void,
  applyLineResult: (result: LineProcessResult, index: number) => void,
): CodeBlockState {
  if (codeBlockState.inCodeBlock) {
    return handleCodeBlockLine(
      line,
      index,
      codeBlockState.codeBlockFence,
      regexes,
      isPending,
      availableTerminalHeight,
      terminalWidth,
      codeBlockState.codeBlockContent,
      codeBlockState.codeBlockLang,
      codeBlockState.codeBlockStartIndex,
      emitBlock,
    );
  }

  const matches = matchLine(line, regexes);

  if (matches.codeFenceMatch !== null) {
    return {
      ...codeBlockState,
      inCodeBlock: true,
      codeBlockFence: matches.codeFenceMatch[1],
      codeBlockLang: matches.codeFenceMatch[2] || null,
      codeBlockStartIndex: index,
    };
  }

  applyLineResult(
    processLine(
      line,
      `line-${index}`,
      index,
      lines,
      matches,
      inTable,
      tableHeaders,
      tableRows,
      regexes,
      terminalWidth,
      responseColor,
      workspaceDirectories,
    ),
    index,
  );
  return codeBlockState;
}

interface SpanCollector {
  spans: ParseSpan[];
  lastLineEmptyAtStart: boolean[];
  lastLineEmpty: boolean;
}

interface TableParseState {
  inTable: boolean;
  tableHeaders: string[];
  tableRows: string[][];
  tableStartIndex: number;
}

function emitSpanBlock(
  collector: SpanCollector,
  block: React.ReactNode,
  spanStart: number,
  spanEnd: number,
): void {
  collector.spans.push({
    block,
    startLine: spanStart,
    endLine: spanEnd,
    lastLineEmptyBefore: collector.lastLineEmptyAtStart[spanStart] ?? true,
  });
  collector.lastLineEmpty = false;
}

function applyLineResultToState(
  result: LineProcessResult,
  index: number,
  collector: SpanCollector,
  tableState: TableParseState,
  terminalWidth: number,
): void {
  const { tableFlush, inTable, tableHeaders, tableRows, block, emptyLine } =
    result;
  if (
    tableFlush &&
    tableState.tableHeaders.length > 0 &&
    tableState.tableRows.length > 0
  ) {
    emitSpanBlock(
      collector,
      <RenderTable
        key={`table-${collector.spans.length}`}
        headers={tableState.tableHeaders}
        rows={tableState.tableRows}
        terminalWidth={terminalWidth}
      />,
      tableState.tableStartIndex,
      index - 1,
    );
    tableState.tableStartIndex = -1;
  }
  if (inTable && !tableState.inTable) {
    tableState.tableStartIndex = index;
  }
  tableState.inTable = inTable;
  tableState.tableHeaders = tableHeaders;
  tableState.tableRows = tableRows;

  if (block !== null) {
    emitSpanBlock(collector, block, index, index);
  } else if (emptyLine && !collector.lastLineEmpty) {
    emitSpanBlock(
      collector,
      <Box key={`spacer-${index}`} height={EMPTY_LINE_HEIGHT} />,
      index,
      index,
    );
    collector.lastLineEmpty = true;
  }
}

function hasActiveTable(tableState: TableParseState): boolean {
  return (
    tableState.inTable &&
    tableState.tableHeaders.length > 0 &&
    tableState.tableRows.length > 0
  );
}

function flushTrailingBlocks(
  collector: SpanCollector,
  tableState: TableParseState,
  codeBlockState: CodeBlockState,
  isPending: boolean,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
  lastIndex: number,
): void {
  if (codeBlockState.inCodeBlock) {
    emitSpanBlock(
      collector,
      <RenderCodeBlock
        key="line-eof"
        content={codeBlockState.codeBlockContent}
        lang={codeBlockState.codeBlockLang}
        isPending={isPending}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
      />,
      Math.max(codeBlockState.codeBlockStartIndex, 0),
      lastIndex,
    );
  }
  if (hasActiveTable(tableState)) {
    emitSpanBlock(
      collector,
      <RenderTable
        key={`table-${collector.spans.length}`}
        headers={tableState.tableHeaders}
        rows={tableState.tableRows}
        terminalWidth={terminalWidth}
      />,
      tableState.tableStartIndex,
      lastIndex,
    );
  }
}

function processLines(
  lines: string[],
  regexes: MarkdownRegexes,
  isPending: boolean,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
  startLine = 0,
  lastLineEmptyBefore = true,
): ProcessLinesResult {
  const collector: SpanCollector = {
    spans: [],
    lastLineEmptyAtStart: [],
    lastLineEmpty: lastLineEmptyBefore,
  };
  const tableState: TableParseState = {
    inTable: false,
    tableHeaders: [],
    tableRows: [],
    tableStartIndex: -1,
  };

  const emitBlock = (
    block: React.ReactNode,
    spanStart: number,
    spanEnd: number,
  ): void => {
    emitSpanBlock(collector, block, spanStart, spanEnd);
  };
  const applyLineResult = (result: LineProcessResult, index: number): void => {
    applyLineResultToState(result, index, collector, tableState, terminalWidth);
  };

  let codeBlockState: CodeBlockState = {
    inCodeBlock: false,
    codeBlockContent: [],
    codeBlockLang: null,
    codeBlockFence: '',
    codeBlockStartIndex: -1,
  };

  for (let index = startLine; index < lines.length; index++) {
    collector.lastLineEmptyAtStart[index] = collector.lastLineEmpty;
    codeBlockState = processLineEntry(
      lines[index],
      index,
      lines,
      regexes,
      isPending,
      availableTerminalHeight,
      terminalWidth,
      codeBlockState,
      tableState.inTable,
      tableState.tableHeaders,
      tableState.tableRows,
      responseColor,
      workspaceDirectories,
      emitBlock,
      applyLineResult,
    );
  }

  flushTrailingBlocks(
    collector,
    tableState,
    codeBlockState,
    isPending,
    availableTerminalHeight,
    terminalWidth,
    lines.length - 1,
  );

  return {
    contentBlocks: collector.spans.map((span) => span.block),
    spans: collector.spans,
    codeBlockState,
    inTable: tableState.inTable,
    tableHeaders: tableState.tableHeaders,
    tableRows: tableState.tableRows,
  };
}
interface LineProcessResult {
  block: React.ReactNode | null;
  emptyLine: boolean;
  inTable: boolean;
  tableHeaders: string[];
  tableRows: string[][];
  tableFlush: boolean;
}

function processTableLine(
  line: string,
  key: string,
  matches: LineMatchResult,
  currentInTable: boolean,
  currentTableHeaders: string[],
  currentTableRows: string[][],
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
): LineProcessResult {
  const empty: LineProcessResult = {
    block: null,
    emptyLine: false,
    inTable: currentInTable,
    tableHeaders: currentTableHeaders,
    tableRows: currentTableRows,
    tableFlush: false,
  };

  if (matches.tableRowMatch && !currentInTable) {
    return {
      ...empty,
      inTable: true,
      tableHeaders: matches.tableRowMatch[1]
        .split('|')
        .map((cell) => cell.trim()),
      tableRows: [],
    };
  }

  if (currentInTable && matches.tableSeparatorMatch) {
    return empty;
  }

  if (currentInTable && matches.tableRowMatch) {
    const cells = matches.tableRowMatch[1]
      .split('|')
      .map((cell) => cell.trim());
    while (cells.length < currentTableHeaders.length) {
      cells.push('');
    }
    if (cells.length > currentTableHeaders.length) {
      cells.length = currentTableHeaders.length;
    }
    return {
      ...empty,
      tableRows: [...currentTableRows, cells],
    };
  }

  if (currentInTable) {
    const block =
      line.trim().length > 0 ? (
        <Box key={key}>
          <RenderInline
            text={line}
            defaultColor={responseColor}
            wrap="wrap"
            workspaceDirectories={workspaceDirectories}
          />
        </Box>
      ) : null;
    return {
      ...empty,
      block,
      inTable: false,
      tableHeaders: [],
      tableRows: [],
      tableFlush: true,
    };
  }

  return empty;
}

function renderListItemBlock(
  key: string,
  itemText: string,
  type: 'ul' | 'ol',
  marker: string,
  leadingWhitespace: string,
  workspaceDirectories: readonly string[] | undefined,
): React.ReactNode {
  return (
    <RenderListItem
      key={key}
      itemText={itemText}
      type={type}
      marker={marker}
      leadingWhitespace={leadingWhitespace}
      workspaceDirectories={workspaceDirectories}
    />
  );
}

function processNonTableLine(
  line: string,
  key: string,
  matches: LineMatchResult,
  terminalWidth: number,
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
): LineProcessResult {
  const empty: LineProcessResult = {
    block: null,
    emptyLine: false,
    inTable: false,
    tableHeaders: [],
    tableRows: [],
    tableFlush: false,
  };

  if (matches.hrMatch) {
    return { ...empty, block: renderHrBlock(key, terminalWidth) };
  }

  if (matches.headerMatch) {
    return {
      ...empty,
      block: renderHeaderBlock(
        key,
        matches.headerMatch,
        responseColor,
        workspaceDirectories,
      ),
    };
  }

  if (matches.quoteMatch) {
    return {
      ...empty,
      block: renderQuoteBlock(key, matches.quoteMatch[1], workspaceDirectories),
    };
  }

  if (matches.ulMatch) {
    return {
      ...empty,
      block: renderListItemBlock(
        key,
        matches.ulMatch[3],
        'ul',
        matches.ulMatch[2],
        matches.ulMatch[1],
        workspaceDirectories,
      ),
    };
  }

  if (matches.olMatch) {
    return {
      ...empty,
      block: renderListItemBlock(
        key,
        matches.olMatch[3],
        'ol',
        matches.olMatch[2],
        matches.olMatch[1],
        workspaceDirectories,
      ),
    };
  }

  if (line.trim().length === 0) {
    return { ...empty, emptyLine: true };
  }

  return {
    ...empty,
    block: renderParagraphBlock(key, line, responseColor, workspaceDirectories),
  };
}

function processLine(
  line: string,
  key: string,
  index: number,
  lines: string[],
  matches: LineMatchResult,
  currentInTable: boolean,
  currentTableHeaders: string[],
  currentTableRows: string[][],
  regexes: MarkdownRegexes,
  terminalWidth: number,
  responseColor: string,
  workspaceDirectories: readonly string[] | undefined,
): LineProcessResult {
  if (matches.tableRowMatch && !currentInTable) {
    if (
      index + 1 < lines.length &&
      lines[index + 1].match(regexes.tableSeparatorRegex)
    ) {
      return processTableLine(
        line,
        key,
        matches,
        currentInTable,
        currentTableHeaders,
        currentTableRows,
        responseColor,
        workspaceDirectories,
      );
    }
    return {
      block: (
        <Box key={key}>
          <RenderInline
            text={line}
            defaultColor={responseColor}
            wrap="wrap"
            workspaceDirectories={workspaceDirectories}
          />
        </Box>
      ),
      emptyLine: false,
      inTable: false,
      tableHeaders: currentTableHeaders,
      tableRows: currentTableRows,
      tableFlush: false,
    };
  }

  if (currentInTable) {
    return processTableLine(
      line,
      key,
      matches,
      currentInTable,
      currentTableHeaders,
      currentTableRows,
      responseColor,
      workspaceDirectories,
    );
  }

  return processNonTableLine(
    line,
    key,
    matches,
    terminalWidth,
    responseColor,
    workspaceDirectories,
  );
}

interface RenderCodeBlockProps {
  content: string[];
  lang: string | null;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

const RenderCodeBlockInternal: React.FC<RenderCodeBlockProps> = ({
  content,
  lang,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const settings = useSettings();
  const MIN_LINES_FOR_MESSAGE = 1; // Minimum lines to show before the "generating more" message
  const RESERVED_LINES = 2; // Lines reserved for the message itself and potential padding

  if (isPending && availableTerminalHeight !== undefined) {
    const MAX_CODE_LINES_WHEN_PENDING = Math.max(
      0,
      availableTerminalHeight - RESERVED_LINES,
    );

    if (content.length > MAX_CODE_LINES_WHEN_PENDING) {
      if (MAX_CODE_LINES_WHEN_PENDING < MIN_LINES_FOR_MESSAGE) {
        // Not enough space to even show the message meaningfully
        return (
          <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING}>
            <Text color={theme.text.secondary}>
              ... code is being written ...
            </Text>
          </Box>
        );
      }
      const truncatedContent = content.slice(0, MAX_CODE_LINES_WHEN_PENDING);
      const colorizedTruncatedCode = colorizeCode(
        truncatedContent.join('\n'),
        lang,
        availableTerminalHeight,
        terminalWidth - CODE_BLOCK_PREFIX_PADDING,
        undefined,
        settings,
      );
      return (
        <Box paddingLeft={CODE_BLOCK_PREFIX_PADDING} flexDirection="column">
          {colorizedTruncatedCode}
          <Text color={theme.text.secondary}>... generating more ...</Text>
        </Box>
      );
    }
  }

  const fullContent = content.join('\n');
  const colorizedCode = colorizeCode(
    fullContent,
    lang,
    availableTerminalHeight,
    terminalWidth - CODE_BLOCK_PREFIX_PADDING,
    undefined,
    settings,
  );

  return (
    <Box
      paddingLeft={CODE_BLOCK_PREFIX_PADDING}
      flexDirection="column"
      width={terminalWidth}
      flexShrink={0}
    >
      {colorizedCode}
    </Box>
  );
};

const RenderCodeBlock = React.memo(RenderCodeBlockInternal);

interface RenderListItemProps {
  itemText: string;
  type: 'ul' | 'ol';
  marker: string;
  leadingWhitespace?: string;
  workspaceDirectories?: readonly string[];
}

const RenderListItemInternal: React.FC<RenderListItemProps> = ({
  itemText,
  type,
  marker,
  leadingWhitespace = '',
  workspaceDirectories,
}) => {
  const prefix = type === 'ol' ? `${marker}. ` : `${marker} `;
  const prefixWidth = prefix.length;
  const indentation = leadingWhitespace.length;
  const listResponseColor = theme.text.response;

  return (
    <Box
      paddingLeft={indentation + LIST_ITEM_PREFIX_PADDING}
      flexDirection="row"
    >
      <Box width={prefixWidth}>
        <Text color={listResponseColor}>{prefix}</Text>
      </Box>
      <Box flexGrow={LIST_ITEM_TEXT_FLEX_GROW}>
        <RenderInline
          text={itemText}
          defaultColor={listResponseColor}
          wrap="wrap"
          workspaceDirectories={workspaceDirectories}
        />
      </Box>
    </Box>
  );
};

const RenderListItem = React.memo(RenderListItemInternal);

interface RenderTableProps {
  headers: string[];
  rows: string[][];
  terminalWidth: number;
}

const RenderTableInternal: React.FC<RenderTableProps> = ({
  headers,
  rows,
  terminalWidth,
}) => (
  <TableRenderer headers={headers} rows={rows} terminalWidth={terminalWidth} />
);

const RenderTable = React.memo(RenderTableInternal);

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal);
