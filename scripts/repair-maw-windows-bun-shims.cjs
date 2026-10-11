// Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
// Windows-only cleanup for obsolete Bun npm-package binary trampolines.
// MAW's source runtime is a separately installed Bun; the repo no longer
// depends on the self-installing "bun" npm package.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const RETIRED_BIN_NAMES = [
  'bun', 'bun.exe', 'bun.cmd', 'bun.ps1',
  'bunx', 'bunx.exe', 'bunx.cmd', 'bunx.ps1',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function repairStaleBunShims(repoRoot, options = {}) {
  if ((options.platform ?? process.platform) !== 'win32') {
    return { skipped: true, moved: [], backupRoot: null };
  }
  const root = path.resolve(repoRoot);
  const manifest = readJson(path.join(root, 'package.json'));
  const lock = readJson(path.join(root, 'package-lock.json'));
  if (lock.packages?.['node_modules/bun']) {
    throw new Error('The npm lock still includes the bun wrapper. Refusing to relocate any shims.');
  }
  const workspaces = manifest.workspaces;
  if (!Array.isArray(workspaces) || workspaces.some((w) => typeof w !== 'string' || !/^packages\/[A-Za-z0-9._-]+$/.test(w))) {
    throw new Error('Unexpected workspace layout; refusing to touch executable shims.');
  }
  const dirs = ['', ...workspaces];
  for (const relative of dirs) {
    const pkg = relative ? readJson(path.join(root, relative, 'package.json')) : manifest;
    if (['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => Object.hasOwn(pkg[key] || {}, 'bun'))) {
      throw new Error(`bun wrapper is declared in ${relative || 'root'}; refusing to move its shims.`);
    }
  }

  const matches = [];
  for (const relative of dirs) {
    const bin = path.join(root, relative, 'node_modules', '.bin');
    for (const name of RETIRED_BIN_NAMES) {
      const source = path.join(bin, name);
      let stat;
      try { stat = fs.lstatSync(source); }
      catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        throw new Error(`Not a file or symlink, refusing to move ${source}`);
      }
      matches.push({ source, relative, name });
    }
  }
  if (matches.length === 0) {
    return { skipped: false, moved: [], backupRoot: null };
  }
  const backupRoot = path.join(root, 'node_modules', '.maw-retired-bun-shims',
    `${Date.now()}-${randomUUID()}`);
  const moved = [];
  try {
    for (const m of matches) {
      const destination = path.join(backupRoot, m.relative || '_root', m.name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(m.source, destination);
      moved.push({ from: m.source, to: destination });
    }
  } catch (error) {
    for (const item of moved.reverse()) {
      fs.renameSync(item.to, item.from);
    }
    throw error;
  }
  return { skipped: false, moved, backupRoot };
}

if (require.main === module) {
  try {
    const result = repairStaleBunShims(process.argv[2] || process.cwd());
    if (result.moved.length) {
      console.log(`[MAW] Preserved ${result.moved.length} obsolete Bun binary shortcut(s) at ${result.backupRoot}`);
      for (const item of result.moved) console.log(`[MAW] Retired ${item.from}`);
    } else {
      console.log('[MAW] No obsolete Bun npm binary shortcuts found.');
    }
  } catch (error) {
    console.error(`[MAW] Bun shim integrity repair refused: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { repairStaleBunShims };
