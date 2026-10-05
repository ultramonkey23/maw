# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
param(
  [string]$BinDir = (Join-Path $HOME '.local\bin')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cliBin = Join-Path $repoRoot 'packages\cli\bin'
$node = (Get-Command node -ErrorAction Stop).Source
$managedMarker = 'MAW managed launcher'

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
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

function Get-LauncherState {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return 'missing' }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return 'symlink' }
  if ($item.PSIsContainer) { return 'nonfile' }
  $existing = [IO.File]::ReadAllText($Path)
  if ($existing.Contains($managedMarker)) { return 'managed' }
  if ($existing.Contains($cliBin) -and ($existing -match 'maw(?:-lab)?\.mjs')) { return 'legacy' }
  return 'unrelated'
}

function Assert-PreservableTarget {
  param([string]$Path)
  $state = Get-LauncherState -Path $Path
  if ($state -eq 'symlink') { throw "Existing launcher symlink/reparse point was not overwritten: $Path" }
  if ($state -eq 'nonfile') { throw "Existing launcher path is not a file: $Path" }
  if ($state -eq 'unrelated') { throw "Existing non-MAW launcher was not overwritten: $Path" }
}

function Get-ManagedBody {
  param([string]$EntryPath)
  return "@echo off`r`nrem MAW managed launcher`r`n`"$node`" `"$EntryPath`" %*`r`n"
}

function Install-OrPreserveLauncher {
  param([string]$Name, [string]$EntryFile)
  $target = Join-Path $BinDir "$Name.cmd"
  $entryPath = Join-Path $cliBin $EntryFile
  Assert-PreservableTarget -Path $target
  $state = Get-LauncherState -Path $target
  $body = Get-ManagedBody -EntryPath $entryPath

  if ($state -eq 'missing') {
    [IO.File]::WriteAllText($target, $body, [Text.Encoding]::ASCII)
    Write-Output "Installed $target"
    return
  }

  $existing = [IO.File]::ReadAllText($target)
  if ($state -eq 'managed' -and $existing -eq $body) {
    Write-Output "Current $target"
  } elseif ($state -eq 'managed') {
    Write-Output "Preserved modified managed launcher $target"
  } elseif ($state -eq 'legacy') {
    Write-Output "Preserved existing customized launcher $target"
  }
}

function Clone-MissingLabPeer {
  $mawLab = Join-Path $BinDir 'maw-lab.cmd'
  $labMaw = Join-Path $BinDir 'lab-maw.cmd'
  Assert-PreservableTarget -Path $mawLab
  Assert-PreservableTarget -Path $labMaw
  $mawLabState = Get-LauncherState -Path $mawLab
  $labMawState = Get-LauncherState -Path $labMaw

  if ($mawLabState -eq 'missing' -and $labMawState -ne 'missing') {
    Copy-Item -LiteralPath $labMaw -Destination $mawLab
    Write-Output "Cloned existing Lab launcher behavior to $mawLab"
  } elseif ($labMawState -eq 'missing' -and $mawLabState -ne 'missing') {
    Copy-Item -LiteralPath $mawLab -Destination $labMaw
    Write-Output "Cloned existing Lab launcher behavior to $labMaw"
  }
}

Install-OrPreserveLauncher -Name 'maw' -EntryFile 'maw.mjs'
Clone-MissingLabPeer
Install-OrPreserveLauncher -Name 'maw-lab' -EntryFile 'maw-lab.mjs'
Install-OrPreserveLauncher -Name 'lab-maw' -EntryFile 'maw-lab.mjs'

$mawLabPath = Join-Path $BinDir 'maw-lab.cmd'
$labMawPath = Join-Path $BinDir 'lab-maw.cmd'
if ((Test-Path -LiteralPath $mawLabPath) -and (Test-Path -LiteralPath $labMawPath)) {
  if ([IO.File]::ReadAllText($mawLabPath) -ne [IO.File]::ReadAllText($labMawPath)) {
    Write-Warning 'maw-lab and lab-maw differ; both were preserved rather than discarding custom behavior.'
  }
}

Write-Output "MAW commands ready: maw, maw-lab, lab-maw"
