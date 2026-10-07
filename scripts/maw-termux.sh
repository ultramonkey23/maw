#!/bin/sh
# MAW Android/Termux source launcher. Never changes the caller's working directory.
# Copyright 2026 Vybestack LLC. SPDX-License-Identifier: Apache-2.0
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 43
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P) || exit 43

fail() {
  printf 'MAW Termux: %s\n' "$1" >&2
  exit 43
}

case "${PREFIX:-}" in
  */com.termux/files/usr) ;;
  *) fail 'This launcher is for Termux. Use the normal MAW launcher on other systems.' ;;
esac

case "$(uname -m)" in
  aarch64|arm64) ;;
  *) fail 'Only Android ARM64 is supported by this launcher.' ;;
esac

[ -f "$repo_root/packages/cli/index.ts" ] || fail "No MAW CLI source at $repo_root/packages/cli/index.ts"
[ -f "$repo_root/scripts/dev-env.ts" ] || fail "Missing $repo_root/scripts/dev-env.ts"
termux_bun_version_file="$repo_root/scripts/maw-termux-bun-version.txt"
[ -f "$termux_bun_version_file" ] || fail "Missing Android Bun version source: $termux_bun_version_file"
termux_bun_version=$(cat "$termux_bun_version_file")
case "$termux_bun_version" in
  ''|*[!0-9.]* ) fail "Invalid Android Bun version in $termux_bun_version_file: $termux_bun_version" ;;
esac
command -v node >/dev/null 2>&1 || fail 'Node.js 24+ is required.'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' || fail 'Node.js 24+ is required.'

# Prefer the Android ABI build, then the npm-managed Bun binary, then PATH.
# Never fall back to a generic glibc/musl ARM64 binary.
bun_path=''
for candidate in \
  "$HOME/.local/share/maw/bun-$termux_bun_version/bin/bun" \
  "$repo_root/node_modules/@oven/bun-linux-aarch64-android/bin/bun" \
  "$HOME/.local/share/maw/bun-1.3.14/bin/bun" \
  "$repo_root/node_modules/bun/bin/bun.exe" \
  "$repo_root/node_modules/bun/bin/bun"
do
  if [ -x "$candidate" ] && "$candidate" --version >/dev/null 2>&1; then
    bun_path=$candidate
    break
  fi
done
if [ -z "$bun_path" ] && command -v bun >/dev/null 2>&1; then
  candidate=$(command -v bun)
  if "$candidate" --version >/dev/null 2>&1; then
    bun_path=$candidate
  fi
fi
if [ -z "$bun_path" ]; then
  fail "Android Bun unavailable. Run: sh $repo_root/scripts/bootstrap-termux-bun.sh (before npm install). Existing ultralab is unchanged."
fi
bun_version=$("$bun_path" --version) || fail "Bun could not execute: $bun_path"
node -e '
  const parts = process.argv[1].split(/[.-]/).slice(0, 3).map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n))) process.exit(1);
  const minimum = [1, 3, 14];
  for (let i = 0; i < 3; i++) {
    if (parts[i] > minimum[i]) process.exit(0);
    if (parts[i] < minimum[i]) process.exit(1);
  }
' "$bun_version" || fail "Bun 1.3.14+ required (found $bun_version)."

if [ "${1:-}" = '--doctor' ]; then
  printf 'MAW Termux: runtime found\n'
  printf 'Preferred Termux Bun: %s\n' "$termux_bun_version"
  printf 'Bun: %s (%s)\n' "$bun_path" "$bun_version"
  if [ "$bun_version" != "$termux_bun_version" ]; then
    printf 'Bun fallback active: selected %s instead of preferred %s\n' "$bun_version" "$termux_bun_version"
  fi
  if "$bun_path" -e 'process.exit(typeof Bun.Image === "function" ? 0 : 1)' >/dev/null 2>&1; then
    printf 'Bun.Image: available\n'
  else
    printf 'Bun.Image: unavailable\n'
  fi
  printf 'Node: %s\n' "$(node --version)"
  printf 'MAW source: %s\n' "$repo_root"
  printf 'Workspace (unchanged): %s\n' "$PWD"
  if [ -f "$HOME/AGENTS.md" ] && [ -f "$HOME/labctl" ]; then
    printf 'Lab home markers: found\n'
  else
    printf 'Lab home markers: not both found (no workspace changes made)\n'
  fi
  exit 0
fi

if [ "${1:-}" = '--image-smoke' ]; then
  exec "$bun_path" "$repo_root/scripts/maw-termux-image-smoke.ts"
fi

if [ "${1:-}" = '--prepare' ]; then
  (cd "$repo_root" && "$bun_path" "$repo_root/scripts/generate-git-commit-info.ts" && "$bun_path" "$repo_root/scripts/generate_prompt_manifest.ts") || fail 'MAW source generation failed; no launcher was installed.'
  exit 0
fi

# Bun preload supplies MAW dev version metadata, matching the desktop source path.
# Preserve cwd, HOME, provider configuration and all CLI arguments as supplied.
# Standalone is the default even when launched from the Lab home checkout.
case "${MAW_LAB_MODE:-off}" in
  on)
    MAW_LAB_MODE=on
    # Lab already owns execution authority. Do not add LLxprt container/seatbelt sandboxing.
    LLXPRT_SANDBOX=false
    export LLXPRT_SANDBOX
    ;;
  *) MAW_LAB_MODE=off ;;
esac
export MAW_LAB_MODE

# Preserve MAW's original launch preference without turning it into a lock.
# OpenRouter currently defaults to xiaomi/mimo-v2.6-pro; explicit CLI/profile
# choices keep their normal higher precedence.
if [ -z "${LLXPRT_DEFAULT_PROVIDER:-}" ]; then
  LLXPRT_DEFAULT_PROVIDER=OpenRouter
fi
export LLXPRT_DEFAULT_PROVIDER

exec "$bun_path" --preload "$repo_root/scripts/dev-env.ts" \
  "$repo_root/packages/cli/index.ts" \
  "$@"
