# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
param(
  [string]$BinDir = (Join-Path $HOME '.local\maw-bin'),
  [string]$RepoRoot = '',
  [switch]$NoUserPathUpdate,
  [switch]$RepairManagedLaunchers,
  [switch]$VerifyLaunch
)

$ErrorActionPreference = 'Stop'
# Default to the installer script's own checkout; a specific already built
# release snapshot may be supplied for launcher-only repair without reinstall.
$repoRoot = if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..') -ErrorAction Stop).Path
} else {
  (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
}
$cliBin = Join-Path $repoRoot 'packages\cli\bin'
# Validate that the installing shell has a PATH-resolved Node. Generated launchers resolve node.exe again at launch time.
$null = Get-Command node -CommandType Application -ErrorAction Stop
$managedMarker = 'MAW managed launcher'
$BinDir = [IO.Path]::GetFullPath($BinDir)

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

function Normalize-PathEntry {
  param([string]$PathEntry)
  if ([string]::IsNullOrWhiteSpace($PathEntry)) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($PathEntry.Trim().Trim('"'))
  try {
    return [IO.Path]::GetFullPath($expanded).TrimEnd([char[]]@('\', '/'))
  } catch {
    return $expanded.TrimEnd([char[]]@('\', '/'))
  }
}

function Test-PathContainsDirectory {
  param([string]$PathValue, [string]$Directory)
  $wanted = Normalize-PathEntry -PathEntry $Directory
  foreach ($entry in ($PathValue -split ';')) {
    $normalized = Normalize-PathEntry -PathEntry $entry
    if ($null -ne $normalized -and [string]::Equals($normalized, $wanted, [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  return $false
}

function Move-PathEntryToFront {
  param([string]$PathValue, [string]$Directory)
  # Preserve every other PATH element (including ones managed by agents).
  # Put the MAW-owned launcher directory first so a pre-existing foreign
  # command with the same name never wins command resolution.
  $wanted = Normalize-PathEntry -PathEntry $Directory
  $others = @()
  foreach ($part in ($PathValue -split ';')) {
    if ([string]::IsNullOrWhiteSpace($part)) { continue }
    $actual = Normalize-PathEntry -PathEntry $part
    if (-not [string]::Equals($actual, $wanted, [StringComparison]::OrdinalIgnoreCase)) {
      $others += $part
    }
  }
  return (@($Directory) + $others) -join ';'
}

function Ensure-LauncherPath {
  param([string]$Directory)

  if (-not $NoUserPathUpdate) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    $newUserPath = Move-PathEntryToFront -PathValue $userPath -Directory $Directory
    if ($newUserPath -cne $userPath) {
      [Environment]::SetEnvironmentVariable('Path', $newUserPath, [EnvironmentVariableTarget]::User)
      Write-Output "Prioritized $Directory in persistent user PATH"
    }
  } else {
    Write-Output "Skipped persistent user PATH update for $Directory"
  }

  $env:Path = Move-PathEntryToFront -PathValue $env:Path -Directory $Directory
  Write-Output "MAW-owned launcher directory is first on this session PATH: $Directory"
}

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
  # Avoid cmd.exe's default current-directory executable lookup while still
  # following the current PATH-managed Node selected by the operator.
  return "@echo off`r`nrem MAW managed launcher`r`nsetlocal`r`nset `"NoDefaultCurrentDirectoryInExePath=1`"`r`nnode.exe `"$EntryPath`" %*`r`nexit /b %ERRORLEVEL%`r`n"
}

function Test-LegacyGeneratedManagedBody {
  param([string]$Body, [string]$EntryPath)

  $lines = [Regex]::Split($Body, '\r?\n')
  if ($lines.Count -eq 4 -and $lines[3] -eq '') {
    $lines = $lines[0..2]
  }
  if ($lines.Count -ne 3) { return $false }
  if ($lines[0] -ne '@echo off' -or $lines[1] -ne 'rem MAW managed launcher') {
    return $false
  }

  $expectedSuffix = ' "' + $EntryPath + '" %*'
  $commandLine = $lines[2]
  if (-not $commandLine.EndsWith($expectedSuffix, [StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  $runtimeToken = $commandLine.Substring(0, $commandLine.Length - $expectedSuffix.Length)
  if ($runtimeToken.Length -lt 2 -or -not $runtimeToken.StartsWith('"') -or -not $runtimeToken.EndsWith('"')) {
    return $false
  }

  $runtimePath = $runtimeToken.Substring(1, $runtimeToken.Length - 2)
  $runtimeName = [IO.Path]::GetFileName($runtimePath)
  return [string]::Equals($runtimeName, 'node.exe', [StringComparison]::OrdinalIgnoreCase) -or
    [string]::Equals($runtimeName, 'node', [StringComparison]::OrdinalIgnoreCase)
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
  } elseif ($state -eq 'managed' -and (Test-LegacyGeneratedManagedBody -Body $existing -EntryPath $entryPath)) {
    [IO.File]::WriteAllText($target, $body, [Text.Encoding]::ASCII)
    Write-Output "Upgraded generated launcher $target"
  } elseif ($RepairManagedLaunchers -and ($state -eq 'managed' -or $state -eq 'legacy')) {
    # Explicit repair is opt-in; keep a unique byte-for-byte backup before
    # replacing a launcher that may contain user-specific modifications.
    $backup = "$target.maw-backup-$([guid]::NewGuid().ToString('N'))"
    Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
    [IO.File]::WriteAllText($target, $body, [Text.Encoding]::ASCII)
    Write-Output "Repaired $target (previous launcher backed up to $backup)"
  } elseif ($state -eq 'managed') {
    Write-Output "Preserved modified managed launcher $target (use -RepairManagedLaunchers to back up and replace)"
  } elseif ($state -eq 'legacy') {
    Write-Output "Preserved existing customized launcher $target (use -RepairManagedLaunchers to back up and replace)"
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

function Assert-LauncherResolution {
  param([string]$Name)
  $expected = [IO.Path]::GetFullPath((Join-Path $BinDir "$Name.cmd"))
  # Honor actual PowerShell precedence: an alias or function can shadow the
  # installed .cmd even when Get-Command -CommandType Application succeeds.
  $command = Get-Command $Name -ErrorAction Stop
  if ($command.CommandType -ne 'Application') {
    throw "$Name is shadowed by $($command.CommandType) '$($command.Name)'. Remove or rename that override before testing the .cmd launcher."
  }
  $resolved = [IO.Path]::GetFullPath($command.Source)
  if (-not [string]::Equals($resolved, $expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Name resolves to $resolved instead of $expected"
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

Ensure-LauncherPath -Directory $BinDir
Assert-LauncherResolution -Name 'maw'
Assert-LauncherResolution -Name 'maw-lab'
Assert-LauncherResolution -Name 'lab-maw'
if ($VerifyLaunch) {
  foreach ($name in $launchers.Keys) {
    $target = Join-Path $BinDir "$name.cmd"
    Write-Output "Testing $name --version"
    & $target --version
    if ($LASTEXITCODE -ne 0) {
      throw "$name launcher exists but failed to execute (exit code $LASTEXITCODE). Check the error printed above, Node 24+, Bun dependencies, and the MAW build."
    }
  }
}
Write-Output "MAW commands ready from any working directory: maw, maw-lab, lab-maw ($BinDir)"
if (-not $NoUserPathUpdate) {
  Write-Output 'The user PATH is persistent for future shells. If this installer was launched in a child PowerShell, open a fresh terminal/session before invoking MAW by name.'
}
