// Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
// Regression for the cross-platform Bun optional-package lock graph.
//
// npm ci checks optional packages even when the target platform is Windows.
// Root MAW intentionally keeps the Termux Android 1.4.2 pin while the
// 1.3.14 bun package and CLI workspace each request Android 1.3.14.
// Both nested locations must be present in npm's lockfile v3.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cliManifest = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'cli', 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
const android = '@oven/bun-linux-aarch64-android';

function locked(pathname, version) {
  const entry = packages[pathname];
  assert.ok(entry, `Missing locked package ${pathname}`);
  assert.equal(entry.version, version, `Incorrect locked version for ${pathname}`);
  assert.equal(entry.optional, true, `Not marked optional: ${pathname}`);
  assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//);
  assert.match(entry.integrity, /^sha512-/);
}

test('Bun Android platform variants preserve both Windows lock consistency and Termux pin', () => {
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(manifest.optionalDependencies[android], '1.4.2');
  assert.equal(cliManifest.optionalDependencies[android], '1.3.14');
  assert.equal(packages[''].optionalDependencies[android], '1.4.2');
  assert.equal(packages['packages/cli'].optionalDependencies[android], '1.3.14');
  assert.equal(packages['node_modules/bun'].optionalDependencies[android], '1.3.14');

  locked('node_modules/' + android, '1.4.2');
  locked('packages/cli/node_modules/' + android, '1.3.14');
  locked('node_modules/bun/node_modules/' + android, '1.3.14');
  // Windows x64 binary alternatives must be in the frozen npm tree before
  // Bun's npm installer runs. A package declaration alone is insufficient.
  for (const platform of ['@oven/bun-windows-x64', '@oven/bun-windows-x64-baseline']) {
    assert.equal(manifest.optionalDependencies[platform], '1.3.14');
    assert.equal(cliManifest.optionalDependencies[platform], '1.3.14');
    assert.equal(packages['node_modules/bun'].optionalDependencies[platform], '1.3.14');
    locked('node_modules/' + platform, '1.3.14');
  }
});
