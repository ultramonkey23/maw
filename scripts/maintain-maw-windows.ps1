# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
<#
.SYNOPSIS
  Check, fast-forward update, rebuild, repair, and verify MAW on Windows.
.DESCRIPTION
  Maintains the MAW fork, not the generic LLxprt npm package.
  Refuses to overwrite local source edits, divergent commits, or non-MAW
  launchers. Run in the current PowerShell so PATH updates are immediate.
#>
param(
  [string]$RepoRoot = (Join-Path $HOME 'maw'),
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'

function Find-NativeCommand {
  param([string]$Name)
  $command = Get-Command -Name $Name -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -eq $command) {
    throw "Required executable '$Name' was not found on PATH."
  }
  return $command.Source
}

function Invoke-Native {
  param([string]$Executable, [string[]]$Arguments)
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$([IO.Path]::GetFileName($Executable)) failed (exit $LASTEXITCODE): $($Arguments -join ' ')"
  }
}

$git = Find-NativeCommand 'git'
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$sourceUrl = 'https://github.com/ultramonkey23/maw.git'
Write-Host '[MAW 1/5] Inspecting source checkout and runtime'

if (-not (Test-Path -LiteralPath $RepoRoot)) {
  if ($CheckOnly) {
    throw "No checkout at $RepoRoot. Run without -CheckOnly to clone the MAW source."
  }
  $parent = Split-Path -Parent $RepoRoot
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Invoke-Native $git @('clone', '--branch', 'main', '--single-branch', $sourceUrl, $RepoRoot)
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) {
  throw "$RepoRoot is not a Git checkout. It was not replaced."
}
$remoteUrl = (& $git -C $RepoRoot remote get-url origin | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $remoteUrl -notmatch '(?i)github\.com[:/]ultramonkey23/maw(?:\.git)?/?$') {
  throw "Unexpected origin '$remoteUrl'. Expected the ultramonkey23/maw fork; no changes made."
}
$branch = (& $git -C $RepoRoot branch --show-current | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
  throw "Checkout is on branch '$branch', not main. Preserve/resolve that branch before updating."
}
$dirty = @(& $git -C $RepoRoot status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect local Git changes.' }
if ($dirty.Count -gt 0 -and (($dirty -join '').Trim()).Length -gt 0) {
  throw "Tracked local changes are present. They were not reset or stashed. Inspect with git status in $RepoRoot."
}

$node = Find-NativeCommand 'node'
$npm = Find-NativeCommand 'npm'
$nodeVersion = (& $node --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Node failed to report a version.' }
$nodeParts = $nodeVersion.TrimStart('v').Split('.')
if ($nodeParts.Count -lt 2 -or [int]$nodeParts[0] -lt 24) {
  throw "Node 24+ is required for this MAW source (found $nodeVersion). Upgrade Node, then rerun."
}
Write-Host "Node: $nodeVersion | MAW checkout: $RepoRoot"
Write-Host "Git branch: $branch | origin: $remoteUrl"

Write-Host '[MAW 2/5] Fetching latest fork main without overwriting local work'
Invoke-Native $git @('-C', $RepoRoot, 'fetch', 'origin', 'main')
$localSha = (& $git -C $RepoRoot rev-parse HEAD | Out-String).Trim()
$latestSha = (& $git -C $RepoRoot rev-parse FETCH_HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $latestSha) { throw 'Unable to resolve the fetched commit.' }
& $git -C $RepoRoot merge-base --is-ancestor HEAD FETCH_HEAD
$isFastForward = ($LASTEXITCODE -eq 0)
Write-Host "Installed source: $localSha"
Write-Host "Latest fetched:   $latestSha"
if (-not $isFastForward) {
  throw 'Local main has divergent/new commits. Refusing a reset or rebase; reconcile manually.'
}
if ($CheckOnly) {
  if ($localSha -eq $latestSha) {
    Write-Host 'MAW source is current. (CheckOnly: no install, rebuild, or launcher changes.)'
  } else {
    Write-Host 'A fast-forward MAW update is available. (CheckOnly: nothing installed.)'
  }
  return
}
if ($localSha -ne $latestSha) {
  Invoke-Native $git @('-C', $RepoRoot, 'merge', '--ff-only', 'FETCH_HEAD')
} else {
  Write-Host 'Already at latest fetched source.'
}

Write-Host '[MAW 3/5] Installing repository-locked dependencies'
Push-Location -LiteralPath $RepoRoot
try {
  Write-Host '[MAW 3/5] Preflighting versioned npm lock dependency edges'
  Invoke-Native $node @('--test', 'scripts/tests/maw-npm-lock-smoke.cjs')
  # npm owns this repository's workspace dependency layout. Once the
  # self-installing 'bun' npm package was removed, npm ci became safe again.
  # It removes the stale Bun-created node_modules tree and restores npm's
  # workspace links and TypeScript executable shims in one clean operation.
  # Keep lifecycle scripts and optional platform binaries enabled.
  $bun = Find-NativeCommand 'bun'
  $bunVersion = (& $bun --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $bunVersion -notmatch '^(\d+\.\d+\.\d+)') {
    throw "Bun at $bun did not report a valid version."
  }
  if ([version]$Matches[1] -lt [version]'1.3.14') {
    throw "Bun $bunVersion is too old: requires >=1.3.14."
  }
  Write-Host "[MAW] Standalone Bun $bunVersion found; npm will rebuild the workspace dependency tree."
  Invoke-Native $npm @('ci', '--include=optional', '--include=dev', '--no-audit', '--no-fund')
  # Probe TypeScript from a workspace to catch the missing-tsc failure at the
  # actual dependency boundary, before starting the expensive coordinated build.
  Invoke-Native $node @('-e', "require.resolve('typescript/bin/tsc', { paths: [process.cwd() + '/packages/cli'] })")
  Write-Host '[MAW 4/5] Building MAW from current source'
  # Run the real build with the verified standalone runtime.
  Invoke-Native $bun @('scripts/build.ts')
} finally {
  Pop-Location
}

Write-Host '[MAW 5/5] Repairing MAW launchers and exercising all three commands'
$installer = Join-Path $RepoRoot 'scripts\install-maw-windows.ps1'
if (-not (Test-Path -LiteralPath $installer)) {
  throw "Source is missing Windows launcher installer: $installer"
}
& $installer -RepairManagedLaunchers -VerifyLaunch
if (-not $?) { throw 'Windows launcher installation failed.' }

$installedSha = (& $git -C $RepoRoot rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $installedSha -ne $latestSha) {
  throw 'Installed checkout no longer matches the commit fetched at the start.'
}
Write-Host "MAW source verified at $installedSha"
Write-Host 'Launch from this PowerShell: lab-maw'
Write-Host 'Inside MAW, /mcp checks the real Lab handshake (not proven by --version).'
