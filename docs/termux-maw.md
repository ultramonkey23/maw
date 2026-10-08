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
- Node.js 24+ and npm installed. Node 26.4.0 has been observed on the first
  target device; this isn't a device-independent compatibility proof.
- Git and enough free device storage for a large multi-workspace npm install.
- Network access for the first checkout and dependency download.

MAW's general Bun compatibility floor remains `>=1.3.14`, but the Termux
Android ARM64 runtime is intentionally pinned to Bun **1.4.2** through
`scripts/maw-termux-bun-version.txt`. The root package's direct
`@oven/bun-linux-aarch64-android` optional dependency is aligned to that
Termux pin without changing the generic Bun package or other platform packages.

The local launcher prefers the separately bootstrapped 1.4.2 Android Bionic
binary, then the Android ABI build installed by npm. The previous isolated
1.3.14 runtime is retained as a rollback candidate behind those preferred
paths, followed by a **working** npm-managed Bun binary and then a working Bun
on `PATH`. It rejects non-running candidates, unsupported architecture, and
versions below MAW's general 1.3.14 floor. `--doctor` reports both the preferred
Termux version and the runtime actually selected, so fallback is visible.

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

MAW development changes land on `master`. A fresh GitHub clone may initially
check out the repository's `main` default branch instead. After verifying
the origin and confirming that `git status --short` is clean, switch to
`master` and fast-forward without overwriting local work:

```sh
git fetch origin master
git switch master
git pull --ff-only origin master
```

If the working tree is dirty or `master` has diverged, stop and reconcile
the local state before switching or pulling; do not reset or force-checkout.

The Android-specific source launcher must exist after checkout/update:
`test -f scripts/maw-termux.sh`. If it does not, stop and inspect the
checkout rather than cloning another copy.

**Bootstrap first:** MAW has Bun-dependent workspace install hooks, while
Termux may have no working Bun installed. The dedicated bootstrap reads the
checked-in Termux Bun version source, downloads the official pinned
`@oven/bun-linux-aarch64-android@1.4.2` archive with `npm pack`, checks the
actual executable on the device, and installs it only under
`$HOME/.local/share/maw/bun-1.4.2`. It does **not** delete the prior
`$HOME/.local/share/maw/bun-1.3.14` runtime, replace `ultralab`, modify the
Termux-wide `node`, or replace any globally installed Bun.

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

After those checks succeed, install or refresh the user-level launchers:

```sh
cd "$HOME/repos/maw"
sh scripts/install-maw-termux-launchers.sh
```

The installer keeps using `$HOME/bin` when that directory is already on
`PATH`, which preserves an established user-bin layout such as the reported
`ultralab` setup. Otherwise it installs `maw`, `maw-lab`, and `lab-maw`
into Termux's `$PREFIX/bin`, the executable directory Termux places on its
default `PATH`. An explicit `MAW_BIN_DIR` override is accepted only when that
directory is already discoverable on `PATH`.

Existing legacy or user-modified MAW launchers are preserved verbatim. If only
one Lab name exists, its behavior is cloned to the missing alias so custom
arguments survive the upgrade. Unrelated commands are never overwritten. The
installer finishes by checking `command -v` for all three names and fails if a
different command shadows the launcher it just installed.

All three shortcuts execute the repository launcher by absolute path without
changing the caller's working directory.

That means these are valid and keep the selected directory as MAW's workspace:

```sh
cd "$HOME"
lab-maw

cd "$HOME/repos/some-other-project"
lab-maw
```

`maw-lab` is identical to `lab-maw`. Lab-attached mode explicitly exports
`LLXPRT_SANDBOX=false`; the Lab remains the execution authority instead of
adding an LLxprt container/seatbelt sandbox around the workspace.

By default MAW selects the existing `OpenRouter` provider alias. That alias's
current default model is `xiaomi/mimo-v2.6-pro`, preserving MAW's original
startup preference without hard-locking it: explicit CLI/profile choices still
win. Passed CLI arguments are forwarded. Configure keys through the CLI's
supported authentication flow rather than placing secrets in launch scripts.

## Diagnostic/rollback

```sh
sh "$HOME/repos/maw/scripts/maw-termux.sh" --doctor
```

The launcher validates the source path, Termux/ARM64, Node and Bun runtime
without generating files or installing anything. Its output gives the resolved
Bun executable, source root and **unchanged** caller cwd.

If running MAW fails, use the existing `ultralab` command as before. Remove only the MAW-managed shortcuts you no longer want **after verifying their
contents** if you want to stop using them. Do not delete any Lab worktrees, `$HOME/labctl`,
`$HOME/AGENTS.md`, or existing Ultralab installation.

## Android compatibility evidence and remaining checks

Observed on the first target device on 2026-10-07:

- Bun 1.4.2 Android ARM64 executed the MAW TypeScript CLI entry successfully.
- `Bun.Image` was available.
- The same `--help` source-entry probe emitted no
  `Cannot read directory "/data/data/": AccessDenied` stderr noise that had
  appeared under the isolated Bun 1.3.14 runtime.
- The normal MAW update path completed `npm install`, source preparation, and
  launcher refresh with Node 26.4.0 and the existing Bun 1.3.14 substrate
  before this 1.4.2 migration was committed.

Still to verify independently where relevant:

1. Can MAW render its interactive Ink UI without truncation or terminal flicker?
2. Do shell tool execution, PTY streaming, and interrupts work in Termux?
3. Are Lab files seen from `$HOME`, without sandbox/chdir surprises?
4. Does exiting MAW leave a separate `ultralab` invocation functional?

None of those remaining on-device checks is replaced by desktop or mocked shell
tests.
