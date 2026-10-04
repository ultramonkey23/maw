/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';

export interface CodeBlockState {
  inCodeBlock: boolean;
  codeBlockContent: string[];
  codeBlockLang: string | null;
  codeBlockFence: string;
  codeBlockStartIndex: number;
}

export interface ParseSpan {
  block: React.ReactNode;
  startLine: number;
  endLine: number;
  lastLineEmptyBefore: boolean;
}

export interface ProcessLinesResult {
  contentBlocks: React.ReactNode[];
  spans: ParseSpan[];
  codeBlockState: CodeBlockState;
  inTable: boolean;
  tableHeaders: string[];
  tableRows: string[][];
}

export interface IncrementalParseCache {
  paramsKey: string;
  lines: string[];
  spans: ParseSpan[];
}

// Streaming appends keep earlier spans sealed and reparse only the tail: a
// span is reusable when its lines are unchanged and its start keeps the same
// one-line lookahead (the reason reuse stops at lcp - 2).
export function parseMarkdownIncremental(
  cache: { current: IncrementalParseCache | null },
  lines: string[],
  paramsKey: string,
  parseFrom: (
    startLine: number,
    lastLineEmptyBefore: boolean,
  ) => ProcessLinesResult,
): ProcessLinesResult {
  const previous = cache.current;
  let reusable: ParseSpan[] = [];
  let parseStart = 0;
  let lastLineEmptyBefore = true;

  if (
    previous !== null &&
    previous.paramsKey === paramsKey &&
    previous.lines.length > 0
  ) {
    let lcp = 0;
    const maxLcp = Math.min(previous.lines.length, lines.length);
    while (lcp < maxLcp && previous.lines[lcp] === lines[lcp]) {
      lcp++;
    }
    const reusableEnd = lcp - 2;
    reusable = previous.spans.filter((span) => span.endLine <= reusableEnd);
    const firstKept = previous.spans.find((span) => span.endLine > reusableEnd);
    parseStart = firstKept !== undefined ? firstKept.startLine : lcp;
    if (firstKept !== undefined) {
      lastLineEmptyBefore = firstKept.lastLineEmptyBefore;
    }
  }

  const parsed = parseFrom(parseStart, lastLineEmptyBefore);
  const spans = [...reusable, ...parsed.spans];
  cache.current = { paramsKey, lines, spans };
  return {
    ...parsed,
    spans,
    contentBlocks: spans.map((span) => span.block),
  };
}
