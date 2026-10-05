# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
param(
  [string]$BinDir = (Join-Path $HOME '.local\bin')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cliBin = Join-Path $repoRoot 'packages\cli\bin'
$node = (Get-Command node -ErrorAction Stop).Source

foreach ($name in @('maw', 'maw-lab')) {
  if (-not (Test-Path -LiteralPath (Join-Path $cliBin "$name.mjs"))) {
    throw "Missing $name launcher in $cliBin"
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules\bun\bin\bun.exe'))) {
  throw 'Run npm ci in the MAW checkout before installing launchers.'
}

$targets = @('maw.cmd', 'maw-lab.cmd') | ForEach-Object { Join-Path $BinDir $_ }
foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target) {
    throw "Existing launcher was not overwritten: $target"
  }
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
foreach ($name in @('maw', 'maw-lab')) {
  $target = Join-Path $BinDir "$name.cmd"
  $entry = Join-Path $cliBin "$name.mjs"
  $body = "@echo off`r`n`"$node`" `"$entry`" %*`r`n"
  $stream = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $bytes = [Text.Encoding]::ASCII.GetBytes($body)
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $stream.Dispose()
  }
  Write-Output "Installed $target"
}
