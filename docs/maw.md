# MAW daily use

MAW is the same full coding application in both modes. `maw` omits the Lab MCP
server, including when the current directory is the Lab checkout. `maw-lab`
requests the existing Lab server and keeps ordinary coding tools available.
Neither command selects a provider or model for you. Existing profiles and CLI
overrides work normally.

## Source setup

From a clean MAW checkout with Node 24+ and Bun 1.3.14+:

```sh
npm ci
npm run build
```

The built CLI package exposes `maw`, `maw-lab`, and the exact `lab-maw` alias in
addition to `llxprt`. On Windows, install/update their user-level launchers in
the existing user bin directory without changing any `llxprt` command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-maw-windows.ps1
maw --help
maw-lab --help
lab-maw --help
```

The installer stops if either target already exists. The user bin directory
must be on `PATH` (the default is `$HOME\.local\bin`). During development, run:

```sh
npm run start:maw -- --help
npm run start:maw-lab -- --help
npm run start:maw-mimo -- "your prompt"
```

`start:maw-mimo` is the previous OpenRouter/MiMo preference, now an explicit
choice. Configure credentials through the existing authentication/profile
system. The launch process preserves the caller's working directory.

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
[termux-maw.md](termux-maw.md). It defaults to standalone operation and no
longer forces OpenRouter/MiMo. The Termux installer creates both `maw-lab` and `lab-maw` as equivalent shortcuts
to the same source launcher with `MAW_LAB_MODE=on`. Android runtime success requires an actual
on-device launch and native dependency check; desktop builds do not prove it.
