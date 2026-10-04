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
 * Shared test helpers for the SessionLockManager suites: hard-link
 * capability detection, temp workspace lifecycle, and the lock/guard fixture
 * writers used by the safety and Android/Termux regression tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionLockManager } from '../SessionLockManager.js';

export const DEAD_PID = 999999999;

/**
 * True when this filesystem can create hard links at all.  Android/Termux
 * rejects `link(2)` with EACCES, so fixtures and tests that require real
 * hard links (legacy guard layouts, the link-based publication primitive)
 * cannot run there; they skip where links are denied while the link-denied
 * suites cover the same behavior via the copy fallback.
 */
export const hardLinksAvailable = await (async () => {
  const probeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lock-link-probe-'));
  try {
    await fs.writeFile(path.join(probeDir, 'a'), 'a', 'utf-8');
    await fs.link(path.join(probeDir, 'a'), path.join(probeDir, 'b'));
    return true;
  } catch {
    return false;
  } finally {
    await fs.rm(probeDir, { recursive: true, force: true });
  }
})();

export async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a genuinely stale lock (dead PID, 49h-old timestamp and mtime).
 * Returns the on-disk ownerToken so a test can verify the lock was replaced.
 */
export async function writeStaleLock(
  chatsDir: string,
  sessionId: string,
): Promise<string> {
  const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
  const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
  const ownerToken = 'stale-original-token';
  await fs.writeFile(
    lockPath,
    JSON.stringify({
      pid: DEAD_PID,
      timestamp: oldTime.toISOString(),
      sessionId,
      ownerToken,
    }),
    'utf-8',
  );
  await fs.utimes(lockPath, oldTime, oldTime);
  return ownerToken;
}

/**
 * Write a transition guard file with the given payload.  Returns the exact
 * bytes written so a test can assert the guard survived byte-identical.
 */
export async function writeGuard(
  lockPath: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const guardPath = lockPath + '.tguard';
  const content = JSON.stringify(payload);
  await fs.writeFile(guardPath, content, 'utf-8');
  return content;
}
