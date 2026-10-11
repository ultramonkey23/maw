/**
 * Focused smoke coverage for MAW's user-level launcher installers.
 * Runs the POSIX/Termux contract on POSIX hosts and the PowerShell contract on
 * Windows hosts without touching the real user PATH.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maw-launcher-smoke-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages', 'cli', 'bin'), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'scripts', 'install-maw-termux-launchers.sh'),
    path.join(root, 'scripts', 'install-maw-termux-launchers.sh'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'scripts', 'install-maw-windows.ps1'),
    path.join(root, 'scripts', 'install-maw-windows.ps1'),
  );
  fs.writeFileSync(
    path.join(root, 'scripts', 'maw-termux.sh'),
    '#!/bin/sh\nprintf \'%s\\n\' "$PWD"\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(root, 'packages', 'cli', 'bin', 'maw.mjs'),
    'console.log(process.cwd());\n',
  );
  fs.writeFileSync(
    path.join(root, 'packages', 'cli', 'bin', 'maw-lab.mjs'),
    'console.log(process.cwd());\n',
  );
  return root;
}

function withOriginalPath(...entries) {
  return [...entries, process.env.PATH || ''].filter(Boolean).join(path.delimiter);
}

test(
  'Termux Bun version source, package metadata, locks, and launcher preference stay aligned',
  { skip: process.platform === 'win32' },
  () => {
    const preferred = fs
      .readFileSync(
        path.join(repoRoot, 'scripts', 'maw-termux-bun-version.txt'),
        'utf8',
      )
      .trim();
    assert.equal(preferred, '1.4.2');

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    );
    assert.equal(
      packageJson.optionalDependencies['@oven/bun-linux-aarch64-android'],
      preferred,
    );
    // Android ARM64 evidence must not silently raise MAW's cross-platform
    // Bun floor or restore the retired self-installing npm Bun wrapper.
    assert.equal(packageJson.engines.bun, '>=1.3.14');
    assert.equal(packageJson.dependencies.bun, undefined);

    const bootstrap = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'bootstrap-termux-bun.sh'),
      'utf8',
    );
    assert.match(bootstrap, /maw-termux-bun-version\.txt/);
    assert.match(
      bootstrap,
      /pkg="@oven\/bun-linux-aarch64-android@\$version"/,
    );
    assert.match(bootstrap, /bun-\$version/);

    const launcher = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'maw-termux.sh'),
      'utf8',
    );
    const preferredCandidate = launcher.indexOf(
      '"$HOME/.local/share/maw/bun-$termux_bun_version/bin/bun"',
    );
    const packageCandidate = launcher.indexOf(
      '"$repo_root/node_modules/@oven/bun-linux-aarch64-android/bin/bun"',
    );
    const rollbackCandidate = launcher.indexOf(
      '"$HOME/.local/share/maw/bun-1.3.14/bin/bun"',
    );
    assert.ok(preferredCandidate >= 0, 'preferred isolated Bun candidate missing');
    assert.ok(packageCandidate > preferredCandidate, 'npm Android Bun must follow preferred isolated runtime');
    assert.ok(rollbackCandidate > packageCandidate, '1.3.14 rollback must follow 1.4.2-capable candidates');

    const packageLock = fs.readFileSync(
      path.join(repoRoot, 'package-lock.json'),
      'utf8',
    );
    assert.match(
      packageLock,
      /"node_modules\/@oven\/bun-linux-aarch64-android": \{\s*"version": "1\.4\.2"/,
    );
    assert.doesNotMatch(packageLock, /"node_modules\/bun": \{/);

    const bunLock = fs.readFileSync(path.join(repoRoot, 'bun.lock'), 'utf8');
    assert.match(
      bunLock,
      /"@oven\/bun-linux-aarch64-android": \["@oven\/bun-linux-aarch64-android@1\.4\.2"/,
    );
    assert.doesNotMatch(bunLock, /"bun": \["bun@1\.3\.14"/);
  },
);

test(
  'Termux installer falls back to PREFIX/bin and resolves MAW from an unrelated cwd',
  { skip: process.platform === 'win32' },
  () => {
    const root = fixtureRoot();
    try {
      const home = path.join(root, 'home');
      const prefix = path.join(root, 'prefix');
      const binDir = path.join(prefix, 'bin');
      const work = path.join(root, 'other-project');
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(work, { recursive: true });
      const env = {
        ...process.env,
        HOME: home,
        PREFIX: prefix,
        PATH: withOriginalPath(binDir),
      };

      const install = spawnSync(
        'sh',
        [path.join(root, 'scripts', 'install-maw-termux-launchers.sh')],
        { cwd: work, env, encoding: 'utf8' },
      );
      assert.equal(install.status, 0, install.stderr || install.stdout);
      for (const name of ['maw', 'maw-lab', 'lab-maw']) {
        assert.equal(fs.existsSync(path.join(binDir, name)), true);
      }

      const launch = spawnSync('sh', ['-c', 'maw'], {
        cwd: work,
        env,
        encoding: 'utf8',
      });
      assert.equal(launch.status, 0, launch.stderr || launch.stdout);
      assert.equal(launch.stdout.trim(), work);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'Termux installer keeps HOME/bin when it is already on PATH',
  { skip: process.platform === 'win32' },
  () => {
    const root = fixtureRoot();
    try {
      const home = path.join(root, 'home');
      const homeBin = path.join(home, 'bin');
      const prefix = path.join(root, 'prefix');
      const prefixBin = path.join(prefix, 'bin');
      fs.mkdirSync(homeBin, { recursive: true });
      fs.mkdirSync(prefixBin, { recursive: true });
      const env = {
        ...process.env,
        HOME: home,
        PREFIX: prefix,
        PATH: withOriginalPath(homeBin, prefixBin),
      };
      const install = spawnSync(
        'sh',
        [path.join(root, 'scripts', 'install-maw-termux-launchers.sh')],
        { env, encoding: 'utf8' },
      );
      assert.equal(install.status, 0, install.stderr || install.stdout);
      assert.equal(fs.existsSync(path.join(homeBin, 'maw')), true);
      assert.equal(fs.existsSync(path.join(prefixBin, 'maw')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'Termux installer rejects an explicit MAW_BIN_DIR that is not discoverable',
  { skip: process.platform === 'win32' },
  () => {
    const root = fixtureRoot();
    try {
      const home = path.join(root, 'home');
      const prefix = path.join(root, 'prefix');
      const prefixBin = path.join(prefix, 'bin');
      const custom = path.join(root, 'hidden-bin');
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(prefixBin, { recursive: true });
      fs.mkdirSync(custom, { recursive: true });
      const env = {
        ...process.env,
        HOME: home,
        PREFIX: prefix,
        MAW_BIN_DIR: custom,
        PATH: withOriginalPath(prefixBin),
      };
      const install = spawnSync(
        'sh',
        [path.join(root, 'scripts', 'install-maw-termux-launchers.sh')],
        { env, encoding: 'utf8' },
      );
      assert.equal(install.status, 2);
      assert.match(install.stderr, /MAW_BIN_DIR is not on PATH/);
      assert.equal(fs.existsSync(path.join(custom, 'maw')), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test('Windows installer persists PATH and resolves Node dynamically without profile edits', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'install-maw-windows.ps1'),
    'utf8',
  );
  assert.match(source, /SetEnvironmentVariable\('Path'/);
  assert.match(source, /EnvironmentVariableTarget\]::User/);
  assert.match(source, /Assert-LauncherResolution/);
  assert.match(source, /NoDefaultCurrentDirectoryInExePath=1/);
  assert.match(source, /node\.exe/);
  assert.match(source, /Test-LegacyGeneratedManagedBody/);
  assert.doesNotMatch(source, /\$PROFILE|Microsoft\.PowerShell_profile\.ps1/);
  assert.doesNotMatch(source, /Get-ManagedBody[\s\S]*\$node[\s\S]*EntryPath/);
});

function findPowerShell() {
  for (const candidate of ['pwsh.exe', 'powershell.exe']) {
    const probe = spawnSync(candidate, ['-NoProfile', '-Command', 'exit 0']);
    if (probe.status === 0) return candidate;
  }
  return null;
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

test(
  'Windows launcher follows relocated PATH Node, rejects cwd shadowing, and keeps cwd',
  { skip: process.platform !== 'win32' },
  () => {
    const engine = findPowerShell();
    assert.ok(engine, 'PowerShell executable not found');
    const root = fixtureRoot();
    try {
      const binDir = path.join(root, 'bin');
      const work = path.join(root, 'other-project');
      const nodeA = path.join(root, 'node-a');
      const nodeB = path.join(root, 'node-b');
      fs.mkdirSync(work, { recursive: true });
      fs.mkdirSync(nodeA, { recursive: true });
      fs.mkdirSync(nodeB, { recursive: true });
      fs.copyFileSync(process.execPath, path.join(nodeA, 'node.exe'));

      const script = path.join(root, 'scripts', 'install-maw-windows.ps1');
      const expected = path.join(binDir, 'maw.cmd');
      const initialPath = nodeA;
      const relocatedPath = `${binDir};${nodeB}`;
      const command = [
        "$ErrorActionPreference = 'Stop'",
        `$env:Path = ${psQuote(initialPath)}`,
        `& ${psQuote(script)} -BinDir ${psQuote(binDir)} -NoUserPathUpdate`,
        `$resolved = (Get-Command maw -CommandType Application -ErrorAction Stop).Source`,
        `if ([IO.Path]::GetFullPath($resolved) -ne [IO.Path]::GetFullPath(${psQuote(expected)})) { throw 'maw resolution mismatch' }`,
        `Remove-Item -LiteralPath ${psQuote(path.join(nodeA, 'node.exe'))} -Force`,
        `Copy-Item -LiteralPath ${psQuote(process.execPath)} -Destination ${psQuote(path.join(nodeB, 'node.exe'))}`,
        `Set-Content -LiteralPath ${psQuote(path.join(work, 'node.exe'))} -Value 'cwd shadow must never execute' -Encoding ASCII`,
        `$env:Path = ${psQuote(relocatedPath)}`,
        `Push-Location ${psQuote(work)}`,
        'try {',
        '  $reported = (maw | Out-String).Trim()',
        "  if ($reported -ne (Get-Location).Path) { throw 'maw did not follow relocated PATH Node or changed caller cwd' }",
        '} finally { Pop-Location }',
      ].join('; ');
      const result = spawnSync(engine, ['-NoProfile', '-Command', command], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  'Windows installer upgrades only the previous generated absolute-Node launcher',
  { skip: process.platform !== 'win32' },
  () => {
    const engine = findPowerShell();
    assert.ok(engine, 'PowerShell executable not found');
    const root = fixtureRoot();
    try {
      const binDir = path.join(root, 'bin');
      const nodeDir = path.join(root, 'node');
      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(nodeDir, { recursive: true });
      fs.copyFileSync(process.execPath, path.join(nodeDir, 'node.exe'));
      const script = path.join(root, 'scripts', 'install-maw-windows.ps1');
      const entry = path.join(root, 'packages', 'cli', 'bin', 'maw.mjs');
      const legacyBody =
        '@echo off\r\n' +
        'rem MAW managed launcher\r\n' +
        `"C:\\stale-node\\node.exe" "${entry}" %*\r\n`;
      fs.writeFileSync(path.join(binDir, 'maw.cmd'), legacyBody, 'ascii');

      const command = [
        "$ErrorActionPreference = 'Stop'",
        `$env:Path = ${psQuote(nodeDir)}`,
        `& ${psQuote(script)} -BinDir ${psQuote(binDir)} -NoUserPathUpdate`,
      ].join('; ');
      const result = spawnSync(engine, ['-NoProfile', '-Command', command], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const upgraded = fs.readFileSync(path.join(binDir, 'maw.cmd'), 'ascii');
      assert.match(upgraded, /NoDefaultCurrentDirectoryInExePath=1/);
      assert.match(upgraded, /node\.exe/);
      assert.doesNotMatch(upgraded, /C:\\stale-node\\node\.exe/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
