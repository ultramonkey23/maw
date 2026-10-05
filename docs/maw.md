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

The built CLI package exposes `maw` and `maw-lab` bins in addition to
`llxprt`. On Windows, install independent `maw.cmd` and `maw-lab.cmd` launchers
in the existing user bin directory without changing any `llxprt` command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-maw-windows.ps1
maw --help
maw-lab --help
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

`maw-lab` looks for a Lab checkout with `AGENTS.md`, `labctl`, and
`tools/lab_mcp_server.py`. It checks `MAW_LAB_ROOT` when set, then Termux home,
the desktop home sibling `ultramonkeydog-lab`, and ancestors of the current
directory. Set `MAW_LAB_ROOT` for another layout and `MAW_LAB_PYTHON` if the
Python executable is not `python`.

The Lab MCP server starts with an absolute script path and its own working
directory. MAW still starts if the Lab root is missing. Use `/mcp` to check a
real connection; a requested attachment is never proof of a handshake. Its
initial tool shortlist offers Lab status, workspace, capability manifest,
Partner identity, explicit project entry, execution proof, and chassis status.
`project_entry` is observational context, not a mission assignment. The
client's `includeTools` list is a discovery filter, not an authority boundary;
Lab-owned tools control consequential actions.

## Appearance

The default MONARCH palette combines bone, ember, iron, and spectral violet.
Set `MAW_STYLE=volt`, `grave`, or `mythic` before launch for three alternative
accent lanes. The palette affects MAW chrome; code highlighting, low-color
fallbacks, and custom LLxprt themes remain separate.

## Termux

The experimental Android source launcher is documented in
[termux-maw.md](termux-maw.md). It defaults to standalone operation and no
longer forces OpenRouter/MiMo. A separate `maw-lab` shortcut can invoke the
same script with `MAW_LAB_MODE=on`. Android runtime success requires an actual
on-device launch and native dependency check; desktop builds do not prove it.
