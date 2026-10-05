# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
param(
  [string]$BinDir = (Join-Path $HOME '.local\\bin')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cliBin = Join-Path $repoRoot 'packages\\cli\\bin'
$node = (Get-Command node -ErrorAction Stop).Source

$launchers = [ordered]@{
  'maw' = 'maw.mjs'
  'maw-lab' = 'maw-lab.mjs'
  'lab-maw' = 'maw-lab.mjs'
}

foreach ($entry in $launchers.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath (Join-Path $cliBin $entry.Value))) {
    throw "Missing $($entry.Name) launcher entry in $cliBin"
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules\\bun\\bin\\bun.exe'))) {
  throw 'Run npm ci in the MAW checkout before installing launchers.'
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

foreach ($entry in $launchers.GetEnumerator()) {
  $name = $entry.Name
  $entryPath = Join-Path $cliBin $entry.Value
  $target = Join-Path $BinDir "$name.cmd"
  $body = "@echo off`r`nrem MAW managed launcher`r`n`"$node`" `"$entryPath`" %*`r`n"

  if (Test-Path -LiteralPath $target) {
    $existing = [IO.File]::ReadAllText($target)
    if ($existing -eq $body) {
      Write-Output "Current $target"
      continue
    }

    $managed = $existing.Contains('MAW managed launcher')
    $legacy = $existing.Contains($cliBin) -and ($existing -match 'maw(?:-lab)?\\.mjs')
    if (-not ($managed -or $legacy)) {
      throw "Existing non-MAW launcher was not overwritten: $target"
    }
  }

  $stream = [IO.File]::Open($target, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $bytes = [Text.Encoding]::ASCII.GetBytes($body)
    $stream.Write($bytes, 0, $bytes.Length)
  } finally {
    $stream.Dispose()
  }
  Write-Output "Installed $target"
}

Write-Output "MAW commands ready: maw, maw-lab, lab-maw"
