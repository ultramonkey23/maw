/**
 * Copyright 2026 Vybestack LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { afterEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  isHardLinkUnavailable,
  linkOrCopyExclusive,
} from './linkOrCopyExclusive.js';

function makeErrno(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

const hardLinksAvailable = await (async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'link-probe-'));
  const source = path.join(dir, 'a');
  const target = path.join(dir, 'b');
  try {
    await fs.writeFile(source, 'x');
    await fs.link(source, target);
    return true;
  } catch {
    return false;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
})();

describe('linkOrCopyExclusive — exclusive publication primitive', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function makeDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'link-or-copy-'));
  }

  it('publishes the complete payload at the target when links are denied', async () => {
    const dir = await makeDir();
    try {
      const source = path.join(dir, 'source.lock');
      const target = path.join(dir, 'target.lock');
      await fs.writeFile(source, JSON.stringify({ pid: 123 }), 'utf-8');
      vi.spyOn(fs, 'link').mockImplementation(() => {
        throw makeErrno('EACCES', 'operation not permitted, link');
      });

      await linkOrCopyExclusive(source, target);

      expect(await fs.readFile(target, 'utf-8')).toBe(
        JSON.stringify({ pid: 123 }),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps EEXIST semantics and never displaces the occupant when links are denied', async () => {
    const dir = await makeDir();
    try {
      const source = path.join(dir, 'source.lock');
      const target = path.join(dir, 'target.lock');
      await fs.writeFile(source, 'newcomer', 'utf-8');
      await fs.writeFile(target, 'occupied', 'utf-8');
      vi.spyOn(fs, 'link').mockImplementation(() => {
        throw makeErrno('EACCES', 'operation not permitted, link');
      });

      await expect(linkOrCopyExclusive(source, target)).rejects.toMatchObject({
        code: 'EEXIST',
      });
      expect(await fs.readFile(target, 'utf-8')).toBe('occupied');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rethrows genuine link failures instead of falling back to a copy', async () => {
    const dir = await makeDir();
    try {
      const source = path.join(dir, 'source.lock');
      const target = path.join(dir, 'target.lock');
      await fs.writeFile(source, 'payload', 'utf-8');
      vi.spyOn(fs, 'link').mockImplementation(() => {
        throw makeErrno('ENOSPC', 'no space left on device');
      });

      await expect(linkOrCopyExclusive(source, target)).rejects.toMatchObject({
        code: 'ENOSPC',
      });
      await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!hardLinksAvailable)(
    'publishes via hard link where the filesystem allows it',
    async () => {
      const dir = await makeDir();
      try {
        const source = path.join(dir, 'source.lock');
        const target = path.join(dir, 'target.lock');
        await fs.writeFile(source, 'payload', 'utf-8');

        await linkOrCopyExclusive(source, target);

        const sourceStat = await fs.stat(source);
        const targetStat = await fs.stat(target);
        expect(targetStat.ino).toBe(sourceStat.ino);
        expect(targetStat.dev).toBe(sourceStat.dev);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
  );

  it('treats only hard-link-denial codes as unavailable', () => {
    for (const code of [
      'EACCES',
      'EPERM',
      'ENOSYS',
      'EOPNOTSUPP',
      'ENOTSUP',
      'EXDEV',
    ]) {
      expect(isHardLinkUnavailable(makeErrno(code, 'denied'))).toBe(true);
    }
    for (const code of ['EEXIST', 'ENOENT', 'ENOSPC', 'EROFS', undefined]) {
      const error =
        code === undefined
          ? new Error('no code')
          : makeErrno(code, 'not a denial');
      expect(isHardLinkUnavailable(error)).toBe(false);
    }
  });
});
