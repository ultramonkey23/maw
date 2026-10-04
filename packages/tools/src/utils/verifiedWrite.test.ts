/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  nodeTextWriteIo,
  writeTextFileVerified,
  type TextWriteIo,
} from './verifiedWrite.js';

function inMemoryIo(mutate?: (content: string) => string): {
  io: TextWriteIo;
  stored: { content: string | undefined };
} {
  const stored: { content: string | undefined } = { content: undefined };
  return {
    stored,
    io: {
      write: (_filePath: string, content: string) => {
        stored.content = mutate ? mutate(content) : content;
      },
      read: () => stored.content ?? '',
    },
  };
}

describe('writeTextFileVerified', () => {
  it('writes and verifies a real file round-trip through nodeTextWriteIo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-write-'));
    try {
      const filePath = path.join(dir, 'round-trip.txt');
      const content = 'alpha\nbeta\n';
      await writeTextFileVerified(filePath, content, nodeTextWriteIo);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails loudly when the stored file is truncated', async () => {
    const { io } = inMemoryIo((content) => content.slice(0, -4));
    await expect(
      writeTextFileVerified('/tmp/truncated.txt', 'hello world!', io),
    ).rejects.toThrow(/truncat/i);
  });

  it('fails loudly and names NUL padding when the stored file gains NUL bytes', async () => {
    const { io } = inMemoryIo((content) => content + '\u0000\u0000\u0000');
    await expect(
      writeTextFileVerified('/tmp/padded.txt', 'hello', io),
    ).rejects.toThrow(/NUL/);
  });

  it('reports the mismatching path in the failure message', async () => {
    const { io } = inMemoryIo(() => 'completely different');
    await expect(
      writeTextFileVerified('/tmp/other.txt', 'expected content', io),
    ).rejects.toThrow(/other\.txt/);
  });

  it('accepts hosts that normalize LF to CRLF on read-back', async () => {
    const { io, stored } = inMemoryIo((content) =>
      content.replace(/\n/g, '\r\n'),
    );
    await writeTextFileVerified('/tmp/eol.txt', 'one\ntwo\n', io);
    expect(stored.content).toBe('one\r\ntwo\r\n');
  });

  it('propagates write failures unchanged', async () => {
    const io: TextWriteIo = {
      write: () => {
        throw new Error('disk exploded');
      },
      read: () => '',
    };
    await expect(
      writeTextFileVerified('/tmp/x.txt', 'content', io),
    ).rejects.toThrow('disk exploded');
  });
});
