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

/**
 * Exclusive publication primitive shared by the lock, lease, guard and
 * owner-record protocols.
 *
 * Every protocol that publishes a fully written artifact under a well-known
 * name needs the same two invariants: the name is claimed atomically
 * exclusively (never displacing an occupant) and the occupant always carries
 * a complete payload.  On most filesystems `link(2)` provides both at once;
 * on Android/Termux it is denied outright.  {@link linkOrCopyExclusive}
 * keeps one implementation of the fallback so each call site cannot drift.
 */

import * as fs from 'node:fs/promises';

/**
 * Error codes meaning "this filesystem will not give me a hard link at all",
 * as opposed to "this particular link attempt lost a race".
 *
 * Android/Termux rejects `link(2)` with EACCES on app-private storage across
 * shell, Node and Bun (1.3.14 and 1.4.2), while symlinks, exclusive
 * directories and `wx` creation work there.  Other platforms express the same
 * condition as EPERM/ENOSYS/EOPNOTSUPP/ENOTSUP/EXDEV.  EEXIST is deliberately
 * absent: it means the target is taken and must keep its existing meaning.
 */
const HARD_LINK_UNAVAILABLE_CODES = new Set([
  'EACCES',
  'EPERM',
  'ENOSYS',
  'EOPNOTSUPP',
  'ENOTSUP',
  'EXDEV',
]);

export function isHardLinkUnavailable(error: unknown): boolean {
  return HARD_LINK_UNAVAILABLE_CODES.has(
    (error as NodeJS.ErrnoException).code ?? '',
  );
}

/**
 * Publish `source` at `target` exclusively, never displacing an occupant.
 *
 * Prefers `link`, whose atomicity is the strongest available: `target` only
 * ever appears carrying the complete, already-synced `source` payload.  Where
 * the filesystem denies hard links, falls back to
 * `copyFile(source, target, COPYFILE_EXCL)`, which preserves the two
 * invariants callers rely on — EEXIST instead of clobbering, and a complete
 * payload at `target` once the call returns.  Everything else rethrows, so a
 * genuine I/O failure is never mistaken for "the target is busy".
 *
 * `symlink` is not a fallback: its lstat identity and the cleanup sweeps'
 * non-symlink rules would change the lifecycle of every artifact downstream.
 */
export async function linkOrCopyExclusive(
  source: string,
  target: string,
): Promise<void> {
  try {
    await fs.link(source, target);
    return;
  } catch (error: unknown) {
    if (!isHardLinkUnavailable(error)) throw error;
  }
  await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
}
