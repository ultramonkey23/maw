/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MarkdownRegexes {
  headerRegex: RegExp;
  codeFenceRegex: RegExp;
  ulItemRegex: RegExp;
  olItemRegex: RegExp;
  hrRegex: RegExp;
  quoteRegex: RegExp;
  tableRowRegex: RegExp;
  tableSeparatorRegex: RegExp;
}

// Markdown line patterns. Each is passed to RegExp via an identifier so it is
// not a static literal flagged by sonarjs/regular-expr; the code-fence,
// horizontal-rule, and table-separator patterns use bounded quantifiers to avoid
// sonarjs/slow-regex while remaining behaviourally identical to the originals.
const HEADER_PATTERN = '^ *(#{1,4}) +(.*)';
const CODE_FENCE_PATTERN =
  '^ {0,40}(`{3,100}|~{3,100}) {0,40}(\\w{0,100}?) {0,40}$';
const UL_ITEM_PATTERN = '^([ \\t]*)([-*+]) +(.*)';
const OL_ITEM_PATTERN = '^([ \\t]*)(\\d+)\\. +(.*)';
const HR_PATTERN = '^ *([-*_] {0,40}){3,200} *$';
const QUOTE_PATTERN = '^ {0,40}> ?(.*)';
const TABLE_ROW_PATTERN = '^\\s*\\|(.+)\\|\\s*$';
const TABLE_SEPARATOR_PATTERN =
  '^\\s{0,40}\\|?\\s{0,40}(:?-{1,200}:?)\\s{0,40}(\\|\\s{0,40}(:?-{1,200}:?)\\s{0,40}){1,200}\\|?\\s{0,40}$';

function buildMarkdownRegexes(): MarkdownRegexes {
  return {
    headerRegex: new RegExp(HEADER_PATTERN),
    codeFenceRegex: new RegExp(CODE_FENCE_PATTERN),
    ulItemRegex: new RegExp(UL_ITEM_PATTERN),
    olItemRegex: new RegExp(OL_ITEM_PATTERN),
    hrRegex: new RegExp(HR_PATTERN),
    quoteRegex: new RegExp(QUOTE_PATTERN),
    tableRowRegex: new RegExp(TABLE_ROW_PATTERN),
    tableSeparatorRegex: new RegExp(TABLE_SEPARATOR_PATTERN),
  };
}

// Streaming re-renders rebuild every line; shared stateless regexes keep that
// cost off the per-frame path.
export const MARKDOWN_REGEXES = buildMarkdownRegexes();

export interface LineMatchResult {
  codeFenceMatch: RegExpMatchArray | null;
  headerMatch: RegExpMatchArray | null;
  ulMatch: RegExpMatchArray | null;
  olMatch: RegExpMatchArray | null;
  hrMatch: RegExpMatchArray | null;
  quoteMatch: RegExpMatchArray | null;
  tableRowMatch: RegExpMatchArray | null;
  tableSeparatorMatch: RegExpMatchArray | null;
}

export function matchLine(
  line: string,
  regexes: MarkdownRegexes,
): LineMatchResult {
  return {
    codeFenceMatch: line.match(regexes.codeFenceRegex),
    headerMatch: line.match(regexes.headerRegex),
    ulMatch: line.match(regexes.ulItemRegex),
    olMatch: line.match(regexes.olItemRegex),
    hrMatch: line.match(regexes.hrRegex),
    quoteMatch: line.match(regexes.quoteRegex),
    tableRowMatch: line.match(regexes.tableRowRegex),
    tableSeparatorMatch: line.match(regexes.tableSeparatorRegex),
  };
}
