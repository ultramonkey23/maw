# MAW on Termux (Android ARM64)

MAW has a separate **experimental** source-launch path for Android ARM64 Termux.
This is not a claim that the full application and every native dependency have
been tested on Android. Verify it on the device before relying on it for work.

## Workspace contract

For the Ultramonkeydog Lab setup, the working root is Termux `$HOME` itself
(identified by `$HOME/AGENTS.md` and `$HOME/labctl`). Do not move it, create
another Lab checkout, or rename its files. Keep the existing
`$HOME/bin/ultralab` launcher unchanged.

MAW's own source lives in `$HOME/repos/maw`, separate from the Lab's runtime
and agent worktrees. The MAW launcher does **not** `cd` into its source during
normal launch; the initial process cwd remains whichever workspace you chose.
The `--prepare` mode temporarily enters MAW's source tree **in a subshell**
only for code generation.

## Device prerequisites

- Termux installed and Android ARM64 (`uname -m` = `aarch64` / `arm64`).
- Node.js 24+ and npm installed. Node 26.3.1/npm 11.17.0 have been reported by
  the first target device; this isn't a device-independent compatibility proof.
- Git and enough free device storage for a large multi-workspace npm install.
- Network access for the first checkout and dependency download.

The root package pins Bun 1.3.14 and includes Android ARM64
`@oven/bun-linux-aarch64-android` as an optional dependency. The local launcher
prefers the separately bootstrapped Android Bionic binary, then the Android ABI
build installed by npm, then a **working** npm-managed Bun binary, then an
already working Bun on `PATH`. It rejects non-running candidates, an
unsupported architecture, and versions below 1.3.14.

## Initial setup: isolated from Ultralab

Run **only** if `$HOME/repos/maw` does not already exist:

```sh
mkdir -p "$HOME/repos"
git clone https://github.com/ultramonkey23/maw.git "$HOME/repos/maw"
```

If you already have an MAW checkout there, inspect its local changes before
pulling or overwriting anything. Never clone over an existing directory.

If `$HOME/repos/maw` **already exists**, check its origin, branch, and
working tree before updating it:

```sh
cd "$HOME/repos/maw"
git remote -v
git branch --show-current
git status --short
```

If the checkout is on `main`, follows `ultramonkey23/maw`, and has no
local changes that would conflict, fast-forward without overwriting work:

```sh
git pull --ff-only origin main
```

The Android-specific source launcher must exist after checkout/update:
`test -f scripts/maw-termux.sh`. If it does not, stop and inspect the
checkout rather than cloning another copy.

**Bootstrap first:** MAW has Bun-dependent workspace install hooks, while
Termux may have no working Bun installed. The dedicated bootstrap downloads
the official pinned `@oven/bun-linux-aarch64-android@1.3.14` archive with
`npm pack`, checks the actual executable on the device, and installs it only
under `$HOME/.local/share/maw/bun-1.3.14`. It does not replace `ultralab`,
the Termux-wide `node`, or any globally installed Bun.

```sh
cd "$HOME/repos/maw"
sh scripts/bootstrap-termux-bun.sh
sh scripts/maw-termux.sh --doctor
npm install --no-audit --no-fund
sh scripts/maw-termux.sh --prepare
```

The IDE companion's checked-in `NOTICES.txt` is retained on Termux rather
than asking its optional VS Code packaging step to execute Bun while npm is
still installing dependencies. On other systems, the existing notice
generation is unchanged. The `--prepare` mode invokes the two TypeScript
generation scripts directly (avoiding known Termux `bun run` cwd problems).

Stop if bootstrap, npm, `--doctor`, or generation fails. Do **not** compensate
by globally reinstalling LLxprt, replacing `ultralab`, modifying Termux's
Node installation, or copying binaries from a generic Linux ARM64 build.
Some native dependencies may still require Android-specific fixes.

After those checks succeed, install a _separate_ launch shortcut. First ensure
`$HOME/bin/maw` does not already exist (including as a broken symlink):

```sh
if [ -e "$HOME/bin/maw" ] || [ -L "$HOME/bin/maw" ]; then
  echo "Existing maw launcher: inspect it; no overwrite performed"
else
  mkdir -p "$HOME/bin"
  cat > "$HOME/bin/maw" <<'SH'
#!/bin/sh
exec sh "$HOME/repos/maw/scripts/maw-termux.sh" "$@"
SH
  chmod +x "$HOME/bin/maw"
fi
```

`$HOME/bin` must already be on `PATH` (as it is for the reported
`ultralab` launcher), otherwise call `"$HOME/bin/maw"` explicitly. This
shortcut is not a symlink; it executes the repository script and leaves the
current working directory intact.

Launch from the existing Lab root:

```sh
cd "$HOME"
maw
```

By default this uses your normal provider/profile configuration; passed CLI
arguments are forwarded. To select the previous preference explicitly, use
`maw --provider OpenRouter --model xiaomi/mimo-v2.6-pro`. Configure keys via
the CLI's supported authentication flow rather than placing secrets in launch
scripts. MAW and LLxprt may reference common per-user configuration stores:
check the effective provider, model and credential scope before changing them.

For optional Lab attachment, create a separate `$HOME/bin/maw-lab` shortcut
only after checking that path is unused. Its script body is:

```sh
#!/bin/sh
MAW_LAB_MODE=on exec sh "$HOME/repos/maw/scripts/maw-termux.sh" "$@"
```

The launcher finds the Lab at Termux `$HOME` using its existing markers and
starts the Lab MCP server with an absolute path. `/mcp` shows actual connection
health. Standalone `maw` omits Lab MCP even from the Lab home directory.

## Diagnostic/rollback

```sh
sh "$HOME/repos/maw/scripts/maw-termux.sh" --doctor
```

The launcher validates the source path, Termux/ARM64, Node and Bun runtime
without generating files or installing anything. Its output gives the resolved
Bun executable, source root and **unchanged** caller cwd.

If running MAW fails, use the existing `ultralab` command as before. Remove
only the new `$HOME/bin/maw` shortcut **after verifying its contents** if you
want to stop using it. Do not delete any Lab worktrees, `$HOME/labctl`,
`$HOME/AGENTS.md`, or existing Ultralab installation.

## Android compatibility still to verify

1. Does Bun 1.3.14 Android ARM64 execute in the target Termux environment?
2. Does the repo's `npm install` complete without unsupported native modules?
3. Can MAW render its interactive Ink UI without truncation or terminal flicker?
4. Do shell tool execution, PTY streaming, and interrupts work in Termux?
5. Are Lab files seen from `$HOME`, without sandbox/chdir surprises?
6. Does exiting MAW leave a separate `ultralab` invocation functional?

None of those on-device checks is replaced by desktop or mocked shell tests.
