/**
 * @license
 * Copyright 2025 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { terminalCapabilityManager } from './terminalCapabilityManager.js';
import {
  restoreTerminalProtocolsSync,
  TERMINAL_PROTOCOL_RESTORE_SEQUENCES,
} from './terminalProtocolCleanup.js';

const { writeSyncMock } = {
  writeSyncMock: vi.fn(),
};

const actual = { ...(await import('node:fs')) };
void vi.mock('node:fs', () => {
  const actualWithDefault = actual as typeof import('node:fs') & {
    default?: Record<string, unknown>;
  };
  return {
    ...actual,
    default: {
      ...(actualWithDefault.default ?? {}),
      writeSync: writeSyncMock,
    },
    writeSync: writeSyncMock,
  };
});

describe('terminalProtocolCleanup', () => {
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    vi.restoreAllMocks();
    writeSyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
    writeSyncMock.mockReset();
  });

  it('restores protocols synchronously when stdout is a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });

    const disableKittySpy = vi
      .spyOn(terminalCapabilityManager, 'disableKittyProtocolOnExit')
      .mockImplementation(() => {});

    restoreTerminalProtocolsSync();

    expect(disableKittySpy).toHaveBeenCalledTimes(1);
    expect(writeSyncMock).toHaveBeenCalledWith(
      process.stdout.fd,
      TERMINAL_PROTOCOL_RESTORE_SEQUENCES,
    );
  });

  it('resets xterm modifyOtherKeys in the synchronous exit payload', () => {
    // Without this reset, keyboard sequences can outlive MAW's /quit and
    // PowerShell can receive encoded numeric key events instead of Enter.
    expect(TERMINAL_PROTOCOL_RESTORE_SEQUENCES).toContain('\x1b[>4;0m');
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    vi.spyOn(terminalCapabilityManager, 'disableKittyProtocolOnExit')
      .mockImplementation(() => {});
    restoreTerminalProtocolsSync();
    expect(writeSyncMock).toHaveBeenCalledWith(
      process.stdout.fd,
      expect.stringContaining('\x1b[>4;0m'),
    );
  });

  it('does nothing when stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });

    const disableKittySpy = vi.spyOn(
      terminalCapabilityManager,
      'disableKittyProtocolOnExit',
    );

    restoreTerminalProtocolsSync();

    expect(disableKittySpy).not.toHaveBeenCalled();
    expect(writeSyncMock).not.toHaveBeenCalled();
  });
});
