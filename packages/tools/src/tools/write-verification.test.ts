/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WriteFileTool } from './write-file.js';
import { EditTool } from './edit.js';
import { createDefaultToolHost } from './edit-utils.js';
import { ToolErrorType } from '../types/tool-error.js';
import type {
  IToolHost,
  IToolHostFileSystemService,
} from '../interfaces/index.js';
import type { ToolResult } from './tools.js';
import type { TextWriteIo } from '../utils/verifiedWrite.js';

async function runTool(
  tool: {
    build(params: unknown): {
      execute(signal: AbortSignal): Promise<ToolResult>;
    };
  },
  params: unknown,
): Promise<ToolResult> {
  try {
    return await tool.build(params).execute(new AbortController().signal);
  } catch (error) {
    return {
      llmContent: '',
      returnDisplay: '',
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function faultyWriteIo(mutate: (content: string) => string): TextWriteIo {
  const stored: { content: string | undefined } = { content: undefined };
  return {
    write: (_filePath: string, content: string) => {
      stored.content = mutate(content);
    },
    read: () => stored.content ?? '',
  };
}

/**
 * File-system service whose writeTextFile silently corrupts what it stores
 * while readTextFile faithfully returns what was stored — the documented
 * Windows hazard (truncated tails / NUL padding) as a testable host fault.
 */
function corruptingFileSystemService(
  mutate: (content: string) => string,
): IToolHostFileSystemService & { stored: { content: string | undefined } } {
  const stored: { content: string | undefined } = { content: undefined };
  return {
    stored,
    readTextFile: async () => stored.content ?? '',
    writeTextFile: async (_filePath: string, content: string) => {
      stored.content = mutate(content);
    },
  };
}

describe('write-file tool write verification', () => {
  let tmpDir: string;
  let host: IToolHost;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-verify-'));
    host = {
      ...createDefaultToolHost(),
      getTargetDir: () => tmpDir,
      getWorkspaceRoots: () => [tmpDir],
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('succeeds and the file content equals the intended content', async () => {
    const filePath = path.join(tmpDir, 'ok.txt');
    const content = 'verified content\n';
    const result = await runTool(new WriteFileTool(host), {
      absolute_path: filePath,
      content,
    });

    expect(result.error).toBeUndefined();
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('returns an error instead of success when the write lands truncated', async () => {
    const filePath = path.join(tmpDir, 'truncated.txt');
    const io = faultyWriteIo((content) => content.slice(0, -4));
    const result = await runTool(
      new WriteFileTool(host, undefined, undefined, io),
      {
        absolute_path: filePath,
        content: 'hello world!',
      },
    );

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.FILE_WRITE_FAILURE);
    expect(result.llmContent).toMatch(/verification/i);
    expect(result.llmContent).toMatch(/truncat/i);
  });

  it('returns an error instead of success when the write lands NUL-padded', async () => {
    const filePath = path.join(tmpDir, 'padded.txt');
    const io = faultyWriteIo((content) => content + '\u0000\u0000');
    const result = await runTool(
      new WriteFileTool(host, undefined, undefined, io),
      {
        absolute_path: filePath,
        content: 'hello',
      },
    );

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.FILE_WRITE_FAILURE);
    expect(result.llmContent).toMatch(/NUL/);
  });
});

describe('edit tool write verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-verify-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function hostWithService(service: IToolHostFileSystemService): IToolHost {
    return {
      ...createDefaultToolHost(),
      getTargetDir: () => tmpDir,
      getWorkspaceRoots: () => [tmpDir],
      getFileSystemService: () => service,
    };
  }

  it('succeeds when the host write round-trips intact', async () => {
    const filePath = path.join(tmpDir, 'edit-ok.txt');
    const service = corruptingFileSystemService((content) => content);
    service.stored.content = 'Hello World\n';
    const result = await runTool(new EditTool(hostWithService(service)), {
      file_path: filePath,
      old_string: 'Hello World',
      new_string: 'Greetings World',
    });

    expect(result.error).toBeUndefined();
    expect(service.stored.content).toContain('Greetings World');
  });

  it('returns an error instead of success when the host write lands truncated', async () => {
    const filePath = path.join(tmpDir, 'edit-truncated.txt');
    const service = corruptingFileSystemService((content) =>
      content.slice(0, -2),
    );
    service.stored.content = 'Hello World\n';
    const result = await runTool(new EditTool(hostWithService(service)), {
      file_path: filePath,
      old_string: 'Hello World',
      new_string: 'Greetings World',
    });

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.FILE_WRITE_FAILURE);
    expect(result.llmContent).toMatch(/verification/i);
    expect(result.llmContent).toMatch(/truncat/i);
  });

  it('returns an error instead of success when the host write lands NUL-padded', async () => {
    const filePath = path.join(tmpDir, 'edit-padded.txt');
    const service = corruptingFileSystemService(
      (content) => content + '\u0000',
    );
    service.stored.content = 'Hello World\n';
    const result = await runTool(new EditTool(hostWithService(service)), {
      file_path: filePath,
      old_string: 'Hello World',
      new_string: 'Greetings World',
    });

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.FILE_WRITE_FAILURE);
    expect(result.llmContent).toMatch(/NUL/);
  });
});
