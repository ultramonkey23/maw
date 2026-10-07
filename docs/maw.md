# MAW daily use

MAW is the same full coding application in both modes. `maw` omits the Lab MCP
server, including when the current directory is the Lab checkout. `maw-lab`
requests the existing Lab server and keeps ordinary coding tools available.
MAW defaults to the existing `OpenRouter` provider alias, whose current default
model is `xiaomi/mimo-v2.6-pro`. Explicit CLI or profile provider/model choices
still take precedence, so the preference is a default rather than a lock.

## Source setup

From a clean MAW checkout with Node 24+ and Bun 1.3.14+:

```sh
npm ci
npm run build
```

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
`tools/lab_mcp_server.py`. It checks `MAW_LAB_ROOT` when set, then Termux home,
the desktop home sibling `ultramonkeydog-lab`, and ancestors of the current
directory. Set `MAW_LAB_ROOT` for another layout and `MAW_LAB_PYTHON` if the
Python executable is not `python`.

The Lab MCP server starts with an absolute script path and its own working
directory while MAW preserves the caller's current repository as the coding
workspace. Lab-attached mode explicitly sets `LLXPRT_SANDBOX=false`; Lab owns the
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
