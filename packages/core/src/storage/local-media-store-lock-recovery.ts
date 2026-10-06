/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import {
  isHardLinkUnavailable,
  linkOrCopyExclusive,
} from '@vybestack/llxprt-code-storage/utils/linkOrCopyExclusive.js';
import type { StoreLockOwner } from './local-media-store-types.js';
import {
  hasErrnoCode,
  parseStoreLockOwner,
  wrapError,
} from './local-media-store-validation.js';

interface LockRecoveryInput {
  readonly lockPath: string;
  readonly lockDirectory: string;
  readonly staleLockMs: number;
  readonly operation: string;
  readonly contentId: string | undefined;
  readonly syncDirectory: () => Promise<void>;
}

interface ObservedLock {
  readonly metadata: Awaited<ReturnType<typeof fs.lstat>>;
  readonly owner: StoreLockOwner | undefined;
}

async function readLockOwner(
  path: string,
): Promise<StoreLockOwner | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path, 'utf8'));
    return parseStoreLockOwner(parsed);
  } catch (error) {
    if (hasErrnoCode(error, 'ENOENT')) throw error;
    return undefined;
  }
}

async function observeLock(path: string): Promise<ObservedLock> {
  const [metadata, owner] = await Promise.all([
    fs.lstat(path),
    readLockOwner(path),
  ]);
  return { metadata, owner };
}

function ownerMatches(
  observed: StoreLockOwner | undefined,
  claimed: StoreLockOwner | undefined,
  current: StoreLockOwner | undefined,
): boolean {
  if (observed === undefined) {
    return claimed === undefined && current === undefined;
  }
  return claimed?.token === observed.token && current?.token === observed.token;
}

function claimStillOwnsStaleLock(
  observed: ObservedLock,
  claimed: ObservedLock,
  current: ObservedLock,
  staleLockMs: number,
): boolean {
  if (!claimed.metadata.isFile() || !current.metadata.isFile()) return false;
  if (claimed.metadata.dev !== observed.metadata.dev) return false;
  if (claimed.metadata.ino !== observed.metadata.ino) return false;
  if (current.metadata.dev !== claimed.metadata.dev) return false;
  if (current.metadata.ino !== claimed.metadata.ino) return false;
  if (current.metadata.nlink < 2) return false;
  if (Date.now() - Number(claimed.metadata.mtimeMs) < staleLockMs) return false;
  return ownerMatches(observed.owner, claimed.owner, current.owner);
}

function capturedStillMatchesObservedStaleLock(
  observed: ObservedLock,
  captured: ObservedLock,
  staleLockMs: number,
): boolean {
  if (!captured.metadata.isFile()) return false;
  if (captured.metadata.dev !== observed.metadata.dev) return false;
  if (captured.metadata.ino !== observed.metadata.ino) return false;
  if (Date.now() - Number(captured.metadata.mtimeMs) < staleLockMs) {
    return false;
  }
  if (observed.owner === undefined) return captured.owner === undefined;
  return captured.owner?.token === observed.owner.token;
}

function combineFailures(primary: unknown, cleanup: unknown): unknown {
  if (primary === undefined) return cleanup;
  if (cleanup === undefined) return primary;
  return new AggregateError(
    [primary, cleanup],
    'Stale store lock recovery and cleanup failed',
  );
}

async function removeClaim(
  claimPath: string,
  syncDirectory: () => Promise<void>,
): Promise<unknown> {
  try {
    await fs.unlink(claimPath);
    await syncDirectory();
    return undefined;
  } catch (error) {
    return hasErrnoCode(error, 'ENOENT') ? undefined : error;
  }
}

async function restoreCapturedLock(
  input: LockRecoveryInput,
  capturePath: string,
): Promise<unknown | undefined> {
  try {
    await linkOrCopyExclusive(capturePath, input.lockPath);
  } catch (error) {
    if (!hasErrnoCode(error, 'EEXIST')) {
      // The capture may be the only surviving copy of a replacement live
      // owner. Keep it intact rather than deleting evidence we cannot restore.
      return error;
    }
    // A newer owner already occupies the well-known path. The captured owner
    // can no longer prove ownership and is superseded, matching the hardened
    // SessionLockManager recovery semantics.
  }
  return removeClaim(capturePath, input.syncDirectory);
}

/**
 * Android/Termux denies hard links with EACCES. When that happens, stale lock
 * recovery cannot use the inode-sharing hard-link claim protocol above.
 *
 * Fall back to the same recoverable rename/capture pattern used by MAW's
 * hardened SessionLockManager: atomically move the candidate out of the
 * well-known path, prove the captured inode/token is still the stale lock we
 * observed, and restore it exclusively if a replacement raced into the slot.
 * The restore uses linkOrCopyExclusive, so it remains non-clobbering on both
 * ordinary filesystems and Android.
 */
async function recoverStaleStoreLockWithoutHardLinks(
  input: LockRecoveryInput,
  observed: ObservedLock,
  capturePath: string,
): Promise<boolean> {
  try {
    await fs.rename(input.lockPath, capturePath);
  } catch (error) {
    if (hasErrnoCode(error, 'ENOENT')) return true;
    throw wrapError(
      `capture stale store lock for ${input.operation}`,
      input.contentId,
      error,
    );
  }

  let captured: ObservedLock;
  try {
    captured = await observeLock(capturePath);
  } catch (error) {
    if (hasErrnoCode(error, 'ENOENT')) return true;
    const restoreFailure = await restoreCapturedLock(input, capturePath);
    throw wrapError(
      `verify captured stale store lock for ${input.operation}`,
      input.contentId,
      combineFailures(error, restoreFailure),
    );
  }

  if (
    capturedStillMatchesObservedStaleLock(
      observed,
      captured,
      input.staleLockMs,
    )
  ) {
    const cleanupFailure = await removeClaim(
      capturePath,
      input.syncDirectory,
    );
    if (cleanupFailure !== undefined) {
      throw wrapError(
        `recover stale store lock for ${input.operation}`,
        input.contentId,
        cleanupFailure,
      );
    }
    return true;
  }

  const restoreFailure = await restoreCapturedLock(input, capturePath);
  if (restoreFailure !== undefined) {
    throw wrapError(
      `restore raced store lock for ${input.operation}`,
      input.contentId,
      restoreFailure,
    );
  }
  return false;
}

export async function recoverStaleStoreLock(
  input: LockRecoveryInput,
): Promise<boolean> {
  let observed: ObservedLock;
  try {
    observed = await observeLock(input.lockPath);
  } catch (error) {
    if (hasErrnoCode(error, 'ENOENT')) return true;
    throw wrapError(
      `inspect store lock for ${input.operation}`,
      input.contentId,
      error,
    );
  }
  if (Date.now() - Number(observed.metadata.mtimeMs) < input.staleLockMs) {
    return false;
  }
  const claimPath = join(
    input.lockDirectory,
    `store.lock.${randomUUID()}.takeover`,
  );
  try {
    await fs.link(input.lockPath, claimPath);
  } catch (error) {
    if (hasErrnoCode(error, 'ENOENT')) return true;
    if (isHardLinkUnavailable(error)) {
      return recoverStaleStoreLockWithoutHardLinks(
        input,
        observed,
        claimPath,
      );
    }
    throw wrapError(
      `claim stale store lock for ${input.operation}`,
      input.contentId,
      error,
    );
  }
  let recovered = false;
  let failure: unknown;
  try {
    const [claimed, current] = await Promise.all([
      observeLock(claimPath),
      observeLock(input.lockPath),
    ]);
    if (
      claimStillOwnsStaleLock(observed, claimed, current, input.staleLockMs)
    ) {
      await fs.unlink(input.lockPath);
      recovered = true;
    }
  } catch (error) {
    if (!hasErrnoCode(error, 'ENOENT')) failure = error;
  }
  failure = combineFailures(
    failure,
    await removeClaim(claimPath, input.syncDirectory),
  );
  if (failure !== undefined) {
    throw wrapError(
      `recover stale store lock for ${input.operation}`,
      input.contentId,
      failure,
    );
  }
  return recovered;
}
