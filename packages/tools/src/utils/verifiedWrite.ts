/**
 * @license
 * Copyright 2026 Ultramonkeydog
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Verified text writes: write, read back, and fail loudly when what landed
 * differs from what was intended. Guards against documented silent write
 * corruption (truncated tails, NUL padding) turning source writes into
 * unreported damage. This is a guard, not a cure for whatever produces the
 * corruption; a failed verification is a truthful error, never a success.
 */

export interface TextWriteIo {
  write: (filePath: string, content: string) => Promise<void> | void;
  read: (filePath: string) => Promise<string> | string;
}

/** Default io backed by node:fs/promises. */
export const nodeTextWriteIo: TextWriteIo = {
  write: async (filePath: string, content: string) => {
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
  },
  read: async (filePath: string) => {
    const fs = await import('node:fs/promises');
    return fs.readFile(filePath, 'utf-8');
  },
};

/**
 * Compare intended vs. written content. Line-ending style is normalized on
 * both sides first: hosts may legitimately read back CRLF where LF was
 * written. Truncation, NUL padding, and content drift are never normalized.
 */
export function writtenMatchesIntended(
  intended: string,
  written: string,
): boolean {
  return intended.replace(/\r\n/g, '\n') === written.replace(/\r\n/g, '\n');
}

function stripTrailingNuls(text: string): string {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === '\u0000') {
    end -= 1;
  }
  return text.slice(0, end);
}

export function describeWriteMismatch(
  filePath: string,
  intended: string,
  written: string,
): string {
  const normalizedIntended = intended.replace(/\r\n/g, '\n');
  const strippedWritten = stripTrailingNuls(written.replace(/\r\n/g, '\n'));
  const nulCount = written.split('\u0000').length - 1;

  const parts = [
    `Write verification failed for '${filePath}': content on disk does not match the intended content (expected ${intended.length} chars, found ${written.length}).`,
  ];
  if (nulCount > 0) {
    parts.push(
      `NUL padding detected (${nulCount} NUL byte(s) in the written file).`,
    );
  }
  if (
    strippedWritten.length < normalizedIntended.length &&
    normalizedIntended.startsWith(strippedWritten)
  ) {
    parts.push(
      `Write appears truncated (short by ${normalizedIntended.length - strippedWritten.length} chars).`,
    );
  }
  parts.push('Treat the file as corrupted until it is rewritten.');
  return parts.join(' ');
}

/**
 * Write `content` to `filePath` through `io`, then read it back and verify it
 * landed intact. Throws when the read-back diverges from the intended content.
 */
export async function writeTextFileVerified(
  filePath: string,
  content: string,
  io: TextWriteIo = nodeTextWriteIo,
): Promise<void> {
  await io.write(filePath, content);
  const written = await io.read(filePath);
  if (!writtenMatchesIntended(content, written)) {
    throw new Error(describeWriteMismatch(filePath, content, written));
  }
}
