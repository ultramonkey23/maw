#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Keep the optional IDE companion's install-time notice generation from
 * blocking Android Termux installs, where it is not shipped as an extension.
 * Normal desktop installations continue to generate notices with Bun.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const termuxPrefix = /\/com\.termux\/files\/usr$/;
const isTermux =
  process.platform === 'android' &&
  termuxPrefix.test(process.env.PREFIX ?? '');

if (isTermux) {
  const notices = path.join(__dirname, '..', 'NOTICES.txt');
  if (!fs.existsSync(notices)) {
    console.error(
      'MAW Termux: checked-in IDE companion NOTICES.txt is missing; refusing to skip notice generation.',
    );
    process.exit(1);
  }
  console.log(
    'MAW Termux: IDE companion packaging is not needed; retaining checked-in NOTICES.txt.',
  );
  process.exit(0);
}

const isBun = (process.env.npm_config_user_agent ?? '').startsWith('bun/');
const command = isBun ? process.env.npm_execpath : 'bun';
if (!command) {
  console.error('Bun executable is unavailable');
  process.exit(1);
}
const result = spawnSync(command, ['./scripts/generate-notices.ts'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error);
}
process.exit(result.status ?? 1);
