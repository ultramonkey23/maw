/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TOOL_STATUS } from '../constants.js';
import { ToolCallStatus } from '../types.js';

const SEVERITY_ORDER: readonly ToolCallStatus[] = [
  ToolCallStatus.Error,
  ToolCallStatus.Canceled,
  ToolCallStatus.Confirming,
  ToolCallStatus.Executing,
  ToolCallStatus.Pending,
  ToolCallStatus.Success,
];

const STATUS_GLYPHS: Readonly<Record<ToolCallStatus, string>> = {
  [ToolCallStatus.Error]: TOOL_STATUS.ERROR,
  [ToolCallStatus.Canceled]: TOOL_STATUS.CANCELED,
  [ToolCallStatus.Confirming]: TOOL_STATUS.CONFIRMING,
  [ToolCallStatus.Executing]: TOOL_STATUS.EXECUTING,
  [ToolCallStatus.Pending]: TOOL_STATUS.PENDING,
  [ToolCallStatus.Success]: TOOL_STATUS.SUCCESS,
};

// Compact severity-first tally like "x2 -1 o1 ✓2". Single-tool groups carry
// their status in the row itself, so the tally only earns space when it
// summarizes more than one tool call.
export function buildToolStatusTally(
  statuses: readonly ToolCallStatus[],
): string {
  if (statuses.length < 2) {
    return '';
  }
  const counts = new Map<ToolCallStatus, number>();
  for (const status of statuses) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return SEVERITY_ORDER.filter((status) => counts.has(status))
    .map((status) => `${STATUS_GLYPHS[status]}${counts.get(status) ?? 0}`)
    .join(' ');
}
