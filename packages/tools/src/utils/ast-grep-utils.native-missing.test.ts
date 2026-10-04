/**
 * @license
 * Copyright 2026 Vybestack LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unmocked missing-binding regression. The existing lazy-registration tests
// mock @ast-grep/napi, so they cannot catch a top-level import that throws when
// the native package is unavailable (as on Android ARM64).
import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('ast-grep utilities with no installed native binding', () => {
  it('imports constants and degrades only when an AST operation is requested', () => {
    // Put just the TypeScript implementation in a separate temporary module
    // root. There is deliberately NO node_modules directory or mocked native
    // package. A fresh Bun process also prevents module-cache false positives.
    const root = mkdtempSync(join(tmpdir(), 'maw-ast-without-napi-'));
    try {
      copyFileSync(
        fileURLToPath(new URL('./ast-grep-utils.ts', import.meta.url)),
        join(root, 'ast-grep-utils.ts'),
      );
      const probe = join(root, 'probe.ts');
      writeFileSync(
        probe,
        `
import { strict as assert } from 'node:assert';
import {
  Lang,
  LANGUAGE_MAP,
  getAstLanguage,
  resolveLanguageFromPath,
  isAstGrepAvailable,
  parseSource,
  parse,
} from './ast-grep-utils.ts';

assert.equal(Lang.TypeScript, 'TypeScript');
assert.equal(LANGUAGE_MAP.ts, 'TypeScript');
assert.equal(getAstLanguage('typescript'), 'TypeScript');
assert.equal(resolveLanguageFromPath('index.tsx'), 'Tsx');
assert.equal(isAstGrepAvailable(), false);

const missing = parseSource(Lang.TypeScript, 'const value = 1');
assert.ok('error' in missing, 'parseSource should report missing core');
assert.match(missing.error, /@ast-grep\\/napi|native binding|Cannot find module/i);
assert.throws(() => parse(Lang.TypeScript, 'const value = 1'));
console.log('MISSING_NATIVE_IMPORT_SURVIVED');
`,
        'utf8',
      );

      const child = spawnSync(process.execPath, [probe], {
        cwd: root,
        encoding: 'utf8',
        timeout: 15_000,
      });

      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(child.stdout).toContain('MISSING_NATIVE_IMPORT_SURVIVED');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
