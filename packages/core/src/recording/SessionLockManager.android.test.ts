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
 * Android/Termux compatibility regression tests for SessionLockManager.
 *
 * Real Termux execution established that hard links fail with EACCES across
 * shell, Node, Bun 1.3.14 and Bun 1.4.2, while symlinks, exclusive
 * directories and `wx` files work.  These tests reproduce that environment by
 * making `fs.link` throw EACCES and prove the lock lifecycle still provides:
 *
 * - complete-payload, exclusive lock publication (never clobbering, never a
 *   symlink),
 * - concurrent-writer exclusion,
 * - honest failure when publication cannot happen at all,
 * - crash recovery (stale locks, abandoned guards, orphaned temps),
 * - live-owner protection (guards and replacement locks survive; stale
 *   retirement restores a captured replacement instead of destroying it),
 * - unchanged ordinary desktop operation on a link-capable filesystem.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  SessionLockManager,
  SessionLockedError,
} from './SessionLockManager.js';
import {
  DEAD_PID,
  fileExists,
  hardLinksAvailable,
  makeTempDir,
} from './__tests__/session-lock-test-helpers.js';

describe('SessionLockManager — Android/Termux locking compatibility', () => {
  function makeErrno(code: string, message: string): NodeJS.ErrnoException {
    const error = new Error(`${code}: ${message}`) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  }

  /** Register temp-chats-dir lifecycle and return a lazy accessor. */
  function useTempChatsDir(): () => string {
    let tempDir = '';
    let chatsDir = '';
    beforeEach(async () => {
      tempDir = await makeTempDir('lock-android-');
      chatsDir = path.join(tempDir, 'chats');
      await fs.mkdir(chatsDir, { recursive: true });
    });
    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });
    return () => chatsDir;
  }

  /** Make every hard-link attempt fail the way Android/Termux does. */
  function useDeniedHardLinks(): void {
    beforeEach(() => {
      vi.spyOn(fs, 'link').mockImplementation(() => {
        throw makeErrno('EACCES', 'operation not permitted, link');
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
  }

  function useMockCleanup(): void {
    afterEach(() => {
      vi.restoreAllMocks();
    });
  }

  async function writeLockFile(
    lockPath: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const sessionId = path.basename(lockPath, '.lock');
    const content = JSON.stringify({
      pid: DEAD_PID,
      timestamp: new Date().toISOString(),
      sessionId,
      ownerToken: 'token-' + sessionId,
      ...overrides,
    });
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, content, 'utf-8');
    return content;
  }

  async function writeGuardFile(
    guardPath: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const content = JSON.stringify({
      pid: DEAD_PID,
      timestamp: new Date().toISOString(),
      claimToken: 'crashed-claim',
      lockDev: null,
      lockIno: null,
      ...overrides,
    });
    await fs.writeFile(guardPath, content, 'utf-8');
    return content;
  }

  function listArtifacts(entries: string[], suffix: string): string[] {
    return entries.filter((entry) => entry.endsWith(suffix)).sort();
  }

  describe('SessionLockManager — Android-compatible hard-link-denied locking', () => {
    const getChatsDir = useTempChatsDir();
    useDeniedHardLinks();

    it('acquire publishes the complete lock payload as a real file, never a symlink', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-publish';
      const handle = await SessionLockManager.acquire(chatsDir, sessionId);

      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      const raw = await fs.readFile(lockPath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      expect(data.pid).toBe(process.pid);
      expect(data.sessionId).toBe(sessionId);
      expect(typeof data.ownerToken).toBe('string');
      expect(typeof data.timestamp).toBe('string');
      const lstat = await fs.lstat(lockPath);
      expect(lstat.isSymbolicLink()).toBe(false);

      const entries = await fs.readdir(chatsDir);
      expect(listArtifacts(entries, '.locktmp')).toStrictEqual([]);
      expect(listArtifacts(entries, '.tguard')).toStrictEqual([]);

      await handle.release();
      expect(await fileExists(lockPath)).toBe(false);
    });

    it('release removes the lock it owns', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-release';
      const handle = await SessionLockManager.acquire(chatsDir, sessionId);
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);

      await handle.release();

      expect(await fileExists(lockPath)).toBe(false);
    });

    it('acquire breaks a stale lock through the guarded transition', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-stale-takeover';
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      await writeLockFile(lockPath, { ownerToken: 'stale-original' });

      const handle = await SessionLockManager.acquire(chatsDir, sessionId);

      const data = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(data.pid).toBe(process.pid);
      expect(data.ownerToken).not.toBe('stale-original');
      expect(await handle.ownsLock()).toBe(true);

      const entries = await fs.readdir(chatsDir);
      expect(listArtifacts(entries, '.tguard')).toStrictEqual([]);
      expect(listArtifacts(entries, '.locktmp')).toStrictEqual([]);

      await handle.release();
      expect(await fileExists(lockPath)).toBe(false);
    });

    it('a second writer is excluded while the lock is held', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-exclusion';
      const handle = await SessionLockManager.acquire(chatsDir, sessionId);
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      const heldBytes = await fs.readFile(lockPath, 'utf-8');

      await expect(
        SessionLockManager.acquire(chatsDir, sessionId),
      ).rejects.toBeInstanceOf(SessionLockedError);

      expect(await fs.readFile(lockPath, 'utf-8')).toBe(heldBytes);
      await handle.release();
    });

    it('an existing lock is never clobbered by publication', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-no-clobber';
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      const originalBytes = await writeLockFile(lockPath, {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        ownerToken: 'live-other-writer',
      });

      await expect(
        SessionLockManager.acquire(chatsDir, sessionId),
      ).rejects.toBeInstanceOf(SessionLockedError);

      expect(await fs.readFile(lockPath, 'utf-8')).toBe(originalBytes);
      await fs.unlink(lockPath);
    });

    it('release does not remove a replacement lock published by another writer', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-release-replacement';
      const handle = await SessionLockManager.acquire(chatsDir, sessionId);
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);

      await writeLockFile(lockPath, {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        ownerToken: 'replacement-owner',
      });

      await handle.release();

      const data = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(data.ownerToken).toBe('replacement-owner');
      await fs.unlink(lockPath);
    });
  });

  describe('SessionLockManager — failed publication on a link-denied filesystem', () => {
    const getChatsDir = useTempChatsDir();
    useDeniedHardLinks();

    it('acquire surfaces the I/O failure and leaves no artifacts', async () => {
      const chatsDir = getChatsDir();
      vi.spyOn(fs, 'copyFile').mockImplementation(() => {
        throw makeErrno('EACCES', 'operation not permitted, copyfile');
      });

      const sessionId = 'android-failed-publication';
      let error: unknown;
      try {
        await SessionLockManager.acquire(chatsDir, sessionId);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeDefined();
      expect(error).not.toBeInstanceOf(SessionLockedError);
      expect((error as NodeJS.ErrnoException).code).toBe('EACCES');

      expect(
        await fileExists(SessionLockManager.getLockPath(chatsDir, sessionId)),
      ).toBe(false);
      expect(await fs.readdir(chatsDir)).toStrictEqual([]);
    });
  });

  describe('SessionLockManager — concurrent acquisition with denied hard links', () => {
    const getChatsDir = useTempChatsDir();
    useDeniedHardLinks();

    it('exactly one of two concurrent acquires wins', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-concurrent';
      const results = await Promise.allSettled([
        SessionLockManager.acquire(chatsDir, sessionId),
        SessionLockManager.acquire(chatsDir, sessionId),
      ]);

      const wins = results.filter((r) => r.status === 'fulfilled');
      const losses = results.filter((r) => r.status === 'rejected');
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(1);
      const rejection = losses[0];
      expect(rejection.reason).toBeInstanceOf(SessionLockedError);

      const winner = wins[0].value;
      expect(await winner.ownsLock()).toBe(true);
      await winner.release();
      expect(
        await fileExists(SessionLockManager.getLockPath(chatsDir, sessionId)),
      ).toBe(false);
    });
  });

  describe('SessionLockManager — crash recovery with denied hard links', () => {
    const getChatsDir = useTempChatsDir();
    useDeniedHardLinks();

    it('acquire reclaims a stale lock guarded by an abandoned claim', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-abandoned-guard';
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      await writeLockFile(lockPath, { ownerToken: 'stale-original' });
      await writeGuardFile(lockPath + '.tguard', {
        claimToken: 'crashed-claimant-token',
      });

      const handle = await SessionLockManager.acquire(chatsDir, sessionId);

      const data = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(data.pid).toBe(process.pid);
      expect(data.ownerToken).not.toBe('stale-original');
      expect(await handle.ownsLock()).toBe(true);

      await handle.release();
      expect(await fileExists(lockPath)).toBe(false);
      expect(await fileExists(lockPath + '.tguard')).toBe(false);
    });

    it('cleanupOrphanedLocks reclaims crashed artifacts but preserves live owners', async () => {
      const chatsDir = getChatsDir();

      const staleLockPath = path.join(chatsDir, 'stale-one.lock');
      await writeLockFile(staleLockPath);

      const deadTemp = path.join(
        chatsDir,
        'dead-one.lock.550e8400-e29b-41d4-a716-446655440002.locktmp',
      );
      await writeLockFile(deadTemp, { sessionId: 'dead-one' });
      const old = new Date(Date.now() - 10 * 60 * 1000);
      await fs.utimes(deadTemp, old, old);

      const liveTemp = path.join(
        chatsDir,
        'live-one.lock.550e8400-e29b-41d4-a716-446655440003.locktmp',
      );
      await writeLockFile(liveTemp, {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        sessionId: 'live-one',
      });
      await fs.utimes(liveTemp, old, old);

      const liveGuardPath = path.join(chatsDir, 'live-two.lock.tguard');
      const liveGuardBytes = await writeGuardFile(liveGuardPath, {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        claimToken: 'live-claimant',
      });

      const removed = await SessionLockManager.cleanupOrphanedLocks(chatsDir);

      expect(removed).toBe(1);
      expect(await fileExists(staleLockPath)).toBe(false);
      expect(await fileExists(deadTemp)).toBe(false);
      expect(await fileExists(liveTemp)).toBe(true);
      expect(await fs.readFile(liveGuardPath, 'utf-8')).toBe(liveGuardBytes);
    });
  });

  describe('SessionLockManager — live-owner protection with denied hard links', () => {
    const getChatsDir = useTempChatsDir();
    useDeniedHardLinks();

    it("a live claimant's guard blocks takeover and is never displaced", async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-live-guard';
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      const lockBytes = await writeLockFile(lockPath, {
        ownerToken: 'stale-original',
      });
      const guardBytes = await writeGuardFile(lockPath + '.tguard', {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        claimToken: 'live-claimant-token',
      });

      await expect(
        SessionLockManager.acquire(chatsDir, sessionId),
      ).rejects.toBeInstanceOf(SessionLockedError);

      expect(await fs.readFile(lockPath + '.tguard', 'utf-8')).toBe(guardBytes);
      expect(await fs.readFile(lockPath, 'utf-8')).toBe(lockBytes);
    });

    it('stale retirement restores a replacement live lock instead of destroying it', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-restore-lock';
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      await writeLockFile(lockPath, { ownerToken: 'stale-original' });

      const replacementBytes = JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
        sessionId,
        ownerToken: 'replacement-live-owner',
      });
      const originalRename = fs.rename;
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (String(from) === lockPath) {
          await fs.unlink(lockPath).catch(() => {});
          await fs.writeFile(lockPath, replacementBytes, 'utf-8');
        }
        return originalRename(from, to);
      });

      await SessionLockManager.removeStaleLock(chatsDir, sessionId);
      vi.restoreAllMocks();

      expect(await fs.readFile(lockPath, 'utf-8')).toBe(replacementBytes);
      await fs.unlink(lockPath);
    });

    it('guard retirement restores a replacement guard instead of displacing it', async () => {
      const chatsDir = getChatsDir();
      const sessionId = 'android-restore-guard';
      const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
      const guardPath = lockPath + '.tguard';
      await writeGuardFile(guardPath, { claimToken: 'crashed-claimant-token' });

      const replacementBytes = JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
        claimToken: 'replacement-live-claim',
        lockDev: null,
        lockIno: null,
      });
      const originalRename = fs.rename;
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (String(from) === guardPath) {
          await fs.unlink(guardPath).catch(() => {});
          await fs.writeFile(guardPath, replacementBytes, 'utf-8');
        }
        return originalRename(from, to);
      });

      await SessionLockManager.cleanupOrphanedLocks(chatsDir);
      vi.restoreAllMocks();

      expect(await fs.readFile(guardPath, 'utf-8')).toBe(replacementBytes);
      await fs.unlink(guardPath);
    });
  });

  describe('SessionLockManager — ordinary desktop operation (hard links available)', () => {
    const getChatsDir = useTempChatsDir();
    useMockCleanup();

    it.skipIf(!hardLinksAvailable)(
      'acquire publishes a complete payload and release leaves a clean directory',
      async () => {
        const chatsDir = getChatsDir();
        const sessionId = 'desktop-lifecycle';
        const handle = await SessionLockManager.acquire(chatsDir, sessionId);

        const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
        const data = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as Record<
          string,
          unknown
        >;
        expect(data.pid).toBe(process.pid);
        expect(data.sessionId).toBe(sessionId);
        expect(typeof data.ownerToken).toBe('string');

        await expect(
          SessionLockManager.acquire(chatsDir, sessionId),
        ).rejects.toBeInstanceOf(SessionLockedError);

        await handle.release();
        expect(await fileExists(lockPath)).toBe(false);
        expect(await fs.readdir(chatsDir)).toStrictEqual([]);
      },
    );

    it.skipIf(!hardLinksAvailable)(
      'stale takeover replaces the lock and leaves no guard or temp artifacts',
      async () => {
        const chatsDir = getChatsDir();
        const sessionId = 'desktop-stale-takeover';
        const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
        await writeLockFile(lockPath, { ownerToken: 'stale-original' });

        const handle = await SessionLockManager.acquire(chatsDir, sessionId);

        const data = JSON.parse(await fs.readFile(lockPath, 'utf-8')) as Record<
          string,
          unknown
        >;
        expect(data.pid).toBe(process.pid);
        expect(data.ownerToken).not.toBe('stale-original');

        const entries = await fs.readdir(chatsDir);
        expect(listArtifacts(entries, '.tguard')).toStrictEqual([]);
        expect(listArtifacts(entries, '.locktmp')).toStrictEqual([]);

        await handle.release();
      },
    );

    it.skipIf(!hardLinksAvailable)(
      'stale retirement restores a replacement live lock via hard link',
      async () => {
        const chatsDir = getChatsDir();
        const sessionId = 'desktop-restore-lock';
        const lockPath = SessionLockManager.getLockPath(chatsDir, sessionId);
        await writeLockFile(lockPath, { ownerToken: 'stale-original' });

        const replacementBytes = JSON.stringify({
          pid: process.pid,
          timestamp: new Date().toISOString(),
          sessionId,
          ownerToken: 'replacement-live-owner',
        });
        const originalRename = fs.rename;
        vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
          if (String(from) === lockPath) {
            await fs.unlink(lockPath).catch(() => {});
            await fs.writeFile(lockPath, replacementBytes, 'utf-8');
          }
          return originalRename(from, to);
        });

        await SessionLockManager.removeStaleLock(chatsDir, sessionId);
        vi.restoreAllMocks();

        expect(await fs.readFile(lockPath, 'utf-8')).toBe(replacementBytes);
        await fs.unlink(lockPath);
      },
    );
  });
});
