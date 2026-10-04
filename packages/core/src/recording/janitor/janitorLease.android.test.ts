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

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { JanitorLease } from './janitorLease.js';
import type { JanitorLeaseHandle } from './janitorLease.js';

const LEASE_FILE_NAME = '.llxprt-janitor.lease';
const LEASE_CLAIM_SUFFIX = '.tclaim';

function makeErrno(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe('JanitorLease — Android/Termux hard-link-denied operation', () => {
  let tempDir: string;
  let trackedLease: JanitorLeaseHandle | null = null;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lease-android-'));
    vi.spyOn(fs, 'link').mockImplementation(() => {
      throw makeErrno('EACCES', 'operation not permitted, link');
    });
  });

  afterEach(async () => {
    if (trackedLease) {
      await trackedLease.release().catch(() => {});
      trackedLease = null;
    }
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /** Lease content that is stale by the absolute 2-hour PID-reuse bound. */
  function staleLeaseContent(ownerToken: string): string {
    const staleTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    return JSON.stringify({
      ownerToken,
      pid: process.pid,
      hostname: os.hostname(),
      createdAt: staleTime,
      heartbeatAt: staleTime,
    });
  }

  async function readLeaseToken(): Promise<unknown> {
    const content = await fs.readFile(
      path.join(tempDir, LEASE_FILE_NAME),
      'utf-8',
    );
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('lease payload is not an object');
    }
    return (parsed as { ownerToken?: unknown }).ownerToken;
  }

  it('acquires, publishes the complete payload, and releases', async () => {
    const lease = await JanitorLease.tryAcquire(tempDir);
    expect(lease).not.toBeNull();
    trackedLease = lease;

    expect(typeof (await readLeaseToken())).toBe('string');
    const entries = await fs.readdir(tempDir);
    expect(entries.filter((name) => name.endsWith('.lease.tmp'))).toStrictEqual(
      [],
    );

    await lease!.release();
    trackedLease = null;
    await expect(
      fs.stat(path.join(tempDir, LEASE_FILE_NAME)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('a second acquisition while the lease is held fails cleanly', async () => {
    const lease = await JanitorLease.tryAcquire(tempDir);
    expect(lease).not.toBeNull();
    trackedLease = lease;

    expect(await JanitorLease.tryAcquire(tempDir)).toBeNull();
  });

  it('takes over a stale lease left by a crashed holder', async () => {
    await fs.writeFile(
      path.join(tempDir, LEASE_FILE_NAME),
      staleLeaseContent('crashed-owner'),
    );

    const lease = await JanitorLease.tryAcquire(tempDir);
    expect(lease).not.toBeNull();
    trackedLease = lease;

    expect(await readLeaseToken()).not.toBe('crashed-owner');
  });

  it('reclaims a crashed stale copy-claim and takes over', async () => {
    const leasePath = path.join(tempDir, LEASE_FILE_NAME);
    await fs.writeFile(leasePath, staleLeaseContent('crashed-contender'));
    // On a link-denied filesystem a crashed contender's transition claim is
    // an exclusive copy of the lease payload, not a second name for its
    // inode.  The stale copy-claim must still be reclaimable.
    await fs.copyFile(leasePath, leasePath + LEASE_CLAIM_SUFFIX);

    const lease = await JanitorLease.tryAcquire(tempDir);
    expect(lease).not.toBeNull();
    trackedLease = lease;
  });

  it('does not take over a fresh replacement while a stale copy-claim pins the old payload', async () => {
    const leasePath = path.join(tempDir, LEASE_FILE_NAME);
    await fs.writeFile(leasePath, staleLeaseContent('old-stale'));
    await fs.copyFile(leasePath, leasePath + LEASE_CLAIM_SUFFIX);

    await fs.unlink(leasePath);
    const freshTime = new Date().toISOString();
    await fs.writeFile(
      leasePath,
      JSON.stringify({
        ownerToken: 'fresh-replacement',
        pid: process.pid,
        hostname: os.hostname(),
        createdAt: freshTime,
        heartbeatAt: freshTime,
      }),
    );

    const lease = await JanitorLease.tryAcquire(tempDir);
    expect(lease).toBeNull();
    expect(await readLeaseToken()).toBe('fresh-replacement');
  });
});
