// Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
// Real lock regression: MAW uses external Bun for source builds, and
// platform-native @oven packages for its published CLI launchers.
// Do not reintroduce the self-installing "bun" npm wrapper: its postinstall
// fails to resolve native optional binaries on Windows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const manifest = readJSON('package.json');
const cliManifest = readJSON('packages/cli/package.json');
const lock = readJSON('package-lock.json');
const pk = lock.packages;
const bunLock = JSON.parse(
  fs.readFileSync(path.join(root, 'bun.lock'), 'utf8').replace(/,(\s*[}\]])/g, '$1'),
);
const android = '@oven/bun-linux-aarch64-android';

function nativeLocked(platform, version) {
  const entry = pk['node_modules/' + platform];
  assert.ok(entry, `Missing native package: ${platform}`);
  assert.equal(entry.version, version, `Wrong pinned native version: ${platform}`);
  assert.equal(entry.optional, true);
  assert.match(entry.integrity, /^sha512-/);
  assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
  const bunEntry = bunLock.packages[platform];
  assert.ok(bunEntry, `Missing Bun-native lock entry ${platform}`);
  assert.equal(bunEntry[0], `${platform}@${version}`);
}

test('Windows and Android Bun platform packages are locked without self-installing Bun wrapper', () => {
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(manifest.engines.bun, '>=1.3.14');
  assert.equal(manifest.dependencies?.bun, undefined);
  assert.equal(cliManifest.dependencies?.bun, undefined);
  assert.ok(!manifest.trustedDependencies.includes('bun'));
  assert.equal(pk[''].dependencies?.bun, undefined);
  assert.equal(pk['packages/cli'].dependencies?.bun, undefined);
  assert.equal(pk['node_modules/bun'], undefined);
  assert.equal(bunLock.workspaces[''].dependencies?.bun, undefined);
  assert.equal(bunLock.workspaces['packages/cli'].dependencies?.bun, undefined);
  assert.equal(bunLock.packages.bun, undefined);
  assert.equal(manifest.optionalDependencies[android], '1.4.2');
  assert.equal(cliManifest.optionalDependencies[android], '1.3.14');
  assert.equal(pk[''].optionalDependencies[android], '1.4.2');
  assert.equal(pk['packages/cli'].optionalDependencies[android], '1.3.14');
  assert.equal(bunLock.workspaces[''].optionalDependencies[android], '1.4.2');
  assert.equal(bunLock.workspaces['packages/cli'].optionalDependencies[android], '1.3.14');
  nativeLocked(android, '1.4.2');
  const cliAndroid = pk['packages/cli/node_modules/' + android];
  assert.equal(cliAndroid?.version, '1.3.14');
  assert.equal(bunLock.packages['@vybestack/llxprt-code/' + android][0], android + '@1.3.14');
  for (const platform of ['@oven/bun-windows-x64', '@oven/bun-windows-x64-baseline']) {
    assert.equal(manifest.optionalDependencies[platform], '1.3.14');
    assert.equal(cliManifest.optionalDependencies[platform], '1.3.14');
    nativeLocked(platform, '1.3.14');
  }
});
