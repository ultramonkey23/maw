# MAW daily use

MAW is the same full coding application in both modes. `maw` omits the Lab MCP
server, including when the current directory is the Lab checkout. `maw-lab`
requests the existing Lab server and keeps ordinary coding tools available.
MAW defaults to the existing `OpenRouter` provider alias, whose current default
model is `xiaomi/mimo-v2.6-pro`. Explicit CLI or profile provider/model choices
still take precedence, so the preference is a default rather than a lock.

## Source setup

From a clean MAW checkout with Node 24+ and an already installed Bun
1.3.14+ on PATH, install workspace dependencies with npm and build with Bun:

```sh
npm ci
npm run build
```

MAW intentionally uses an existing Bun runtime for *source development*;
it no longer installs Bun through the `bun` npm wrapper (whose postinstall
can fail on Windows even when Bun is already available). The `@oven/bun-*`
platform-specific optional packages remain locked for published CLI launchers.
The Termux bootstrap still selects its independent Android Bun 1.4.2.

The built CLI package exposes `maw`, `maw-lab`, and the exact `lab-maw` alias in
addition to `llxprt`. On Windows, install/update their user-level launchers in
the existing user bin directory without changing any `llxprt` command. Running
the installer in the current PowerShell lets it update both the persistent User
`Path` and the current session immediately:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& .\scripts\install-maw-windows.ps1
maw --help
maw-lab --help
lab-maw --help
```

### One-command Windows check, update, build, and repair

Paste this in **Windows PowerShell**, from any directory. It runs in your
current PowerShell session, so the repaired PATH is available immediately:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force; $p = Join-Path $env:TEMP 'maintain-maw-windows.ps1'; Invoke-WebRequest 'https://raw.githubusercontent.com/ultramonkey23/maw/main/scripts/maintain-maw-windows.ps1' -OutFile $p; & $p
```

Then enter `lab-maw`. The updater verifies the MAW fork at `$HOME\maw`,
fetches and fast-forwards `main` without discarding source edits, then runs
`npm ci` to replace the broken dependency tree with npm's complete workspace
links and TypeScript binaries. It builds with the installed Bun executable and
repairs the three managed MAW launchers.
Node 24+, Git, npm, and a standalone Bun 1.3.14+ must be available.
Use `& $p -CheckOnly` to inspect
local vs remote source without installing. The script reports the commit
SHA, since the package version does not necessarily change on every commit.
`--version` verifies command startup, not the live Lab MCP handshake.
Once MAW is running, check `/mcp` to confirm Lab attachment.

### Recover or upgrade an existing Windows checkout

Run in **Windows PowerShell** from your existing MAW checkout (normally
`C:\\Users\\harin\\maw`), with Node 24+ and Bun 1.3.14+ on PATH:

```powershell
git status --short
git branch --show-current
git pull --ff-only origin main
npm ci
npm run build
& .\\scripts\\install-maw-windows.ps1 -RepairManagedLaunchers -VerifyLaunch
Get-Command lab-maw -All
lab-maw --version
```

Use this update sequence on the `main` branch. `git pull --ff-only` refuses a
divergent history; resolve any local work deliberately rather than resetting or
discarding it. `npm ci` recreates npm's workspace links and TypeScript executable shims using the
locked dependency graph; `npm run build` builds the current source. **Do not replace this fork by
installing the generic upstream `@vybestack/llxprt-code` package.**

`-RepairManagedLaunchers` backs up old recognized MAW launcher files under
unique `.maw-backup-...` names before replacing stale customized `.cmd`
wrappers with wrappers pointing at this checkout. The default installer mode
continues to preserve modified launchers; unrelated files, symlinks and
PowerShell aliases are never silently replaced. `-VerifyLaunch` actually
invokes each installed command with `--version` and stops on nonzero exit,
rather than reporting success solely because the `.cmd` file exists.
PowerShell alias/function shadowing or another PATH entry is reported as a
resolution failure. Running the installer in the **same PowerShell window**
updates that session's PATH; launching it with `powershell -File` requires
opening a new terminal for the parent session to see the updated PATH.

If the version check fails, inspect the error above it. Run `node --version`,
`bun --version`, and `Get-Command lab-maw -All`. A source install requires the
Bun runtime and native dependencies in addition to the command shim.
The installer never changes your OpenRouter credentials, profiles, or Lab
registry.

The installer refreshes only unchanged MAW-managed launchers. Existing legacy
or user-modified MAW launchers are preserved, and a missing Lab alias is cloned
from the existing Lab launcher so custom arguments survive the upgrade.
Generated MAW launchers from the earlier absolute-Node format are upgraded
automatically; hand-modified managed launchers are not.

Windows launchers resolve `node.exe` from the current `Path` at **launch
time**, so Node version-manager switches and upgrades do not leave MAW pointing
at an installer-time executable that no longer exists. The wrapper sets
`NoDefaultCurrentDirectoryInExePath` before that lookup so `cmd.exe` does not
take a `node.exe` from the caller's project directory ahead of the PATH-managed
runtime.

Unrelated commands are never overwritten. The default launcher directory is
`$HOME\.local\bin`; if it is missing from the persistent per-user `Path`,
the installer adds it and verifies that `Get-Command` resolves all three MAW
commands to the installed launchers. It does not edit PowerShell profile files.
Use `-NoUserPathUpdate` only when another environment manager owns persistent
`Path` configuration.

If the installer is instead launched in a child process such as
`powershell -File ...`, that child cannot modify its parent shell's environment.
The persistent User `Path` is still updated, but start a fresh terminal/session
before invoking MAW by name. During development, run:

```sh
npm run start:maw -- --help
npm run start:maw-lab -- --help
npm run start:maw-mimo -- "your prompt"
```

`start:maw` and `start:maw-lab` keep MAW's OpenRouter default through
`LLXPRT_DEFAULT_PROVIDER`; the built-in OpenRouter alias supplies MiMo v2.6 Pro.
`start:maw-mimo` remains as an explicit compatibility path. Configure credentials
through the existing authentication/profile system. The launch process preserves
the caller's working directory.

## Lab attachment

`maw-lab` and `lab-maw` are the same Lab-attached mode. They look for a Lab
checkout with `AGENTS.md`, `labctl`, and
`tools/lab_mcp_server.py`. An explicit `MAW_LAB_ROOT` is authoritative: if it
does not identify a real Lab checkout, MAW does not silently attach a different
one. Without that override, an invocation whose cwd is itself a Lab root wins
first, matching the Lab's canonical path resolver. Next come the Lab's existing
`ULTRAMONKEYDOG_LAB_ROOT`, `LAB_ROOT`, and `LAB_DIR` environment signals;
cwd ancestors are only fallback discovery after those canonical hints, followed
by Termux home and desktop `$HOME/ultramonkeydog-lab`. This lets `lab-maw`
attach from an unrelated project without requiring a second MAW-only path
configuration when the Lab environment is already established, while avoiding a
stale ancestor checkout silently outranking the canonical Lab root.

`MAW_LAB_PYTHON` remains the explicit interpreter override. Otherwise MAW
checks for an actually runnable interpreter: Windows follows the Lab launcher's
`py -3`, `python`, then `python3` preference; POSIX/Termux tries `python`
then `python3`.

The Lab MCP server starts with an absolute script path and its own Lab working
directory while MAW preserves the caller's current repository as the coding
workspace. MAW passes that caller workspace separately as `MAW_WORKSPACE_ROOT`,
so Lab code/state ownership and coding-repo identity are never inferred from the
same cwd. In an unregistered Git repo, Lab `project_entry` can therefore return
the existing `EPHEMERAL_UNREGISTERED` context immediately; registration is for
durable portfolio memory, not permission to enter or inspect the repository.

Lab-attached mode explicitly sets `LLXPRT_SANDBOX=false`; Lab owns the
execution authority instead of nesting the session in LLxprt's container/seatbelt
sandbox. MAW still starts if the Lab root is missing. Use `/mcp` to check a
real connection; a requested attachment is never proof of a handshake.

The explicit `maw-lab` mode now discovers **the complete canonical Lab MCP
registry** via `tools/list`. It no longer replaces project settings with the
previous seven-name `includeTools` discovery filter. It sets `trust: true`
for this deliberately selected private Lab attachment to avoid per-tool MCP
approval prompts. The ordinary workspace trust gate, server-side Lab authority,
recovery checks and Git/project ownership are unchanged; network access is
not enabled. This is configuration source truth, not an observed new handshake
or successful consequence. The standalone `maw` command still omits Lab.
`project_entry` remains observational context, not a mission assignment.

## Appearance

The default MONARCH palette now uses stronger crimson, gold, bone, and violet,
with a large MAW/Savage Crown ASCII mark and a compact two-line crown for
narrow terminals. The width check includes the full signature to prevent
wrapping within the header. Set `MAW_STYLE=volt`, `grave`, or `mythic`
before launch for alternative accent lanes. The palette affects MAW chrome;
code highlighting, low-color fallbacks, and custom LLxprt themes remain
separate. An actual Windows/Termux re-launch is still needed to verify
terminal/font rendering.

## Termux

The experimental Android source launcher is documented in
[termux-maw.md](termux-maw.md). It defaults to OpenRouter (and therefore the
OpenRouter alias's MiMo v2.6 Pro default) while explicit CLI/profile choices can
override it. The Termux installer creates both `maw-lab` and `lab-maw` as equivalent shortcuts
to the same source launcher with `MAW_LAB_MODE=on`. Android runtime success requires an actual
on-device launch and native dependency check; desktop builds do not prove it.
