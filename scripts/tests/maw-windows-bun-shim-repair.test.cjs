// Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { repairStaleBunShims } = require('../repair-maw-windows-bun-shims.cjs');

function fixture(withBunDependency = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maw-shims-'));
  fs.mkdirSync(path.join(root, 'packages', 'cli', 'node_modules', '.bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    workspaces: ['packages/cli'],
    dependencies: withBunDependency ? { bun: '1.3.14' } : {},
  }));
  fs.writeFileSync(path.join(root, 'packages', 'cli', 'package.json'),
    JSON.stringify({ name: '@vybestack/llxprt-code' }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: {} }));
  return root;
}

test('safely quarantines only retired Bun and Bunx workspace shims, repeat is idempotent', () => {
  const root = fixture();
  try {
    const a = path.join(root, 'node_modules', '.bin');
    const b = path.join(root, 'packages', 'cli', 'node_modules', '.bin');
    fs.writeFileSync(path.join(a, 'bun.exe'), 'stale');
    fs.writeFileSync(path.join(a, 'bun.cmd'), 'stale cmd');
    fs.writeFileSync(path.join(b, 'bunx.exe'), 'stale bunx');
    fs.writeFileSync(path.join(b, 'tsc.cmd'), 'working compiler');
    const report = repairStaleBunShims(root, { platform: 'win32' });
    assert.equal(report.moved.length, 3);
    assert.ok(report.moved.every(({ from, to }) => !fs.existsSync(from) && fs.existsSync(to)));
    assert.equal(fs.readFileSync(path.join(b, 'tsc.cmd'), 'utf8'), 'working compiler');
    assert.equal(repairStaleBunShims(root, { platform: 'win32' }).moved.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('refuses mutation when Bun npm wrapper is still declared', () => {
  const root = fixture(true);
  const target = path.join(root, 'node_modules', '.bin', 'bun.exe');
  try {
    fs.writeFileSync(target, 'do-not-touch');
    assert.throws(() => repairStaleBunShims(root, { platform: 'win32' }), /declared/);
    assert.ok(fs.existsSync(target));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('never alters files outside Windows', () => {
  assert.deepEqual(repairStaleBunShims('/nonexistent', { platform: 'linux' }).moved, []);
});
