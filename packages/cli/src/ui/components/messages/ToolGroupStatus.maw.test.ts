/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'bun:test';
import { theme } from '../../semantic-colors.js';
import { ToolCallStatus, type IndividualToolCallDisplay } from '../../types.js';
import { deriveBorderColors } from './ToolGroupMessage.js';

const tool = (
  status: ToolCallStatus,
  name = 'read_file',
): IndividualToolCallDisplay => ({
  callId: 'test',
  name,
  description: 'Test tool',
  status,
  resultDisplay: undefined,
  confirmationDetails: undefined,
});

describe('MAW tool-group visual state', () => {
  it('shows failed shell commands as errors rather than shell activity', () => {
    const state = deriveBorderColors([
      tool(ToolCallStatus.Error, 'run_shell_command'),
    ]);
    expect(state.isShellCommand).toBe(true);
    expect(state.borderColor).toBe(theme.status.error);
    expect(state.borderDimColor).toBe(false);
  });

  it('recognizes the normal Shell Command display label too', () => {
    const state = deriveBorderColors([
      tool(ToolCallStatus.Success, 'Shell Command'),
    ]);
    expect(state.isShellCommand).toBe(true);
    expect(state.borderColor).toBe(theme.ui.symbol);
  });

  it('does not let a running tool hide a sibling error', () => {
    const state = deriveBorderColors([
      tool(ToolCallStatus.Executing),
      tool(ToolCallStatus.Error),
    ]);
    expect(state.borderColor).toBe(theme.status.error);
  });

  it('makes approval more prominent than background pending work', () => {
    const state = deriveBorderColors([
      tool(ToolCallStatus.Pending),
      tool(ToolCallStatus.Confirming),
    ]);
    expect(state.borderColor).toBe(theme.status.warning);
    expect(state.borderDimColor).toBe(false);
  });

  it('distinguishes active work from completed and canceled work', () => {
    expect(
      deriveBorderColors([tool(ToolCallStatus.Executing)]).borderColor,
    ).toBe(theme.border.focused);
    expect(deriveBorderColors([tool(ToolCallStatus.Success)]).borderColor).toBe(
      theme.border.default,
    );
    expect(
      deriveBorderColors([tool(ToolCallStatus.Canceled)]).borderColor,
    ).toBe(theme.text.secondary);
  });
});
