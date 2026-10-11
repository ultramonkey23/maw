# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
<#
.SYNOPSIS
  Fetch, stage, build, and verify MAW without touching an active agent checkout.
.DESCRIPTION
  Maintains the MAW fork, not the generic LLxprt npm package.
  Handles dirty source worktrees, unpushed commits, and parallel agent edits by
  installing the remote main commit into a detached Git worktree. No stashing,
  reset, merge, source checkout replacement, or branch creation. Installed
  launchers point at the clean release snapshot, not the active source tree.
  Run in the current PowerShell so PATH updates are immediate.
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
# The source checkout belongs to the user and their agents. It may contain
# staged/unstaged changes, untracked state, unpushed commits, or a non-main branch.
# Do not inspect its cleanliness to gate installation; never modify its files.
$branch = (& $git -C $RepoRoot branch --show-current | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to determine active source branch.' }
if ([string]::IsNullOrWhiteSpace($branch)) { $branch = '(detached HEAD)' }
Write-Host "[MAW] Active source branch: $branch (never modified by the updater)"

$node = Find-NativeCommand 'node'
$npm = Find-NativeCommand 'npm'
$nodeVersion = (& $node --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Node failed to report a version.' }
$nodeParts = $nodeVersion.TrimStart('v').Split('.')
if ($nodeParts.Count -lt 2 -or [int]$nodeParts[0] -lt 24) {
  throw "Node 24+ is required for this MAW source (found $nodeVersion). Upgrade Node, then rerun."
}
Write-Host "Node: $nodeVersion | MAW checkout: $RepoRoot"
Write-Host "Source checkout: $RepoRoot | origin: $remoteUrl"

Write-Host '[MAW 2/5] Fetching published main; preserving the agent checkout'
# Fetch the remote ref without checking out, merging, resetting, rebasing, or
# stashing the user's active checkout. This also works when local HEAD is ahead
# of or divergent from origin/main.
Invoke-Native $git @('-C', $RepoRoot, 'fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main')
$localSha = (& $git -C $RepoRoot rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve active source HEAD.' }
$latestSha = (& $git -C $RepoRoot rev-parse 'refs/remotes/origin/main' | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $latestSha -notmatch '^[0-9a-f]{40}$') { throw 'Unable to resolve latest remote main commit.' }
Write-Host "Agent checkout HEAD (preserved): $localSha"
Write-Host "Published main commit:          $latestSha"

# Detached worktrees don't create a new branch or touch any files in $RepoRoot.
# One snapshot per SHA also ensures a failed or in-progress deployment never
# overwrites the previously working installation.
$releaseRoot = Join-Path $HOME '.maw-runtimes'
$releasePath = Join-Path $releaseRoot $latestSha.Substring(0, 12)
$releasePath = [IO.Path]::GetFullPath($releasePath)
if ($CheckOnly) {
  Write-Host "Active checkout stays unchanged. Install snapshot: $releasePath"
  Write-Host 'CheckOnly: no worktree, dependency install, build, or launcher changes.'
  return
}

if (-not (Test-Path -LiteralPath $releaseRoot)) {
  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $releasePath)) {
  Write-Host "[MAW] Creating detached build snapshot: $releasePath"
  Invoke-Native $git @('-C', $RepoRoot, '-c', 'core.longpaths=true', 'worktree', 'add', '--detach', '--', $releasePath, $latestSha)
} else {
  # Never silently adopt or overwrite a pre-existing unrelated directory.
  # Check the Git worktree registry, not just the presence of a .git file.
  $registered = @(& $git -C $RepoRoot worktree list --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect registered Git worktrees.' }
  $ownsRelease = $false
  foreach ($item in $registered) {
    if ($item -like 'worktree *') {
      $registeredPath = [IO.Path]::GetFullPath($item.Substring(9).Trim())
      if ([string]::Equals($registeredPath, $releasePath, [StringComparison]::OrdinalIgnoreCase)) {
        $ownsRelease = $true
        break
      }
    }
  }
  if (-not $ownsRelease) {
    throw "Install snapshot path exists but is not registered as a worktree of $RepoRoot. Refusing to overwrite: $releasePath"
  }
  $snapshotSha = (& $git -C $releasePath rev-parse HEAD | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $snapshotSha -ne $latestSha) {
    throw "Install snapshot at $releasePath is not the requested commit; refusing to change it."
  }
  $snapshotEdits = @(& $git -C $releasePath status --porcelain --untracked-files=no)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect install snapshot.' }
  if (($snapshotEdits -join '').Trim()) {
    throw "The dedicated install snapshot has tracked edits; refusing to overwrite: $releasePath. The active source checkout is unaffected."
  }
  Write-Host "[MAW] Reusing detached snapshot: $releasePath"
}

# The release checkout is now the only checkout we install/build into.
$installSha = (& $git -C $releasePath rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $installSha -ne $latestSha) {
  throw 'Release snapshot does not match the requested commit.'
}

Write-Host '[MAW 3/5] Installing repository-locked dependencies'
Push-Location -LiteralPath $releasePath
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
$installer = Join-Path $releasePath 'scripts\install-maw-windows.ps1'
if (-not (Test-Path -LiteralPath $installer)) {
  throw "Source is missing Windows launcher installer: $installer"
}
& $installer -RepairManagedLaunchers -VerifyLaunch
if (-not $?) { throw 'Windows launcher installation failed.' }

$installedSha = (& $git -C $releasePath rev-parse HEAD | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $installedSha -ne $latestSha) {
  throw 'Installed checkout no longer matches the commit fetched at the start.'
}
Write-Host "MAW installed snapshot verified at $installedSha"
Write-Host "Active agent checkout preserved: $RepoRoot"
Write-Host 'Launch from this PowerShell: lab-maw'
Write-Host 'Inside MAW, /mcp checks the real Lab handshake (not proven by --version).'
