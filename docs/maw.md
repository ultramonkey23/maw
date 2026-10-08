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

## First-response timeouts

MAW uses two distinct watchdogs around model streaming, on both Windows and
Android/Termux:

- First response: defaults to 300000 ms (5 minutes). It covers provider
  activation and the wait for initial model progress. Use
  `/set stream-first-response-timeout-ms 600000` as a temporary diagnostic
  override for legitimately slow requests, not as a replacement for
  investigating repeated stalls. The environment variable
  `LLXPRT_STREAM_FIRST_RESPONSE_TIMEOUT_MS` takes precedence.
- Inter-chunk idle: disabled by default. Use
  `/set stream-idle-timeout-ms 300000` or the
  `LLXPRT_STREAM_IDLE_TIMEOUT_MS` environment variable to bound later
  stream silence after progress has been observed.

The OpenAI-compatible Chat Completions path (including MAW's OpenRouter
default) now reports token-bearing reasoning, text, and tool-call deltas to
the shared liveness observer even when the model's output is buffered. Mere
role-only and usage-only frames do not count as model progress, so an empty
opening frame cannot silently disable the first-response guard. This does
not prevent real upstream stalls, connection failures, or slow provider
activation. For diagnosis, record the provider/model, which timeout fired,
its threshold and configuration source, and whether any stream progress
appeared. Never paste API keys from logs.

## Termux

The experimental Android source launcher is documented in
[termux-maw.md](termux-maw.md). It defaults to OpenRouter (and therefore the
OpenRouter alias's MiMo v2.6 Pro default) while explicit CLI/profile choices can
override it. The Termux installer creates both `maw-lab` and `lab-maw` as equivalent shortcuts
to the same source launcher with `MAW_LAB_MODE=on`. Android runtime success requires an actual
on-device launch and native dependency check; desktop builds do not prove it.
