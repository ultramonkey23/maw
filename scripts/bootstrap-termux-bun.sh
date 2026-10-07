#!/bin/sh
# Bootstrap the official pinned Bionic/ARM64 Bun runtime separately from
# npm workspace install hooks; never touch the global Node or ultralab.
# Copyright 2026 Vybestack LLC. SPDX-License-Identifier: Apache-2.0
set -eu
umask 077

fail() { printf 'MAW Bun bootstrap: %s\n' "$1" >&2; exit 43; }

case "${PREFIX:-}" in
  */com.termux/files/usr) ;;
  *) fail 'Only Android Termux is supported by this bootstrap.' ;;
esac
case "$(uname -m)" in
  aarch64|arm64) ;;
  *) fail 'Only Android ARM64 is supported.' ;;
esac
command -v npm >/dev/null 2>&1 || fail 'npm is required.'

version_file="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/maw-termux-bun-version.txt"
[ -f "$version_file" ] || fail "Missing Android Bun version source: $version_file"
version=$(cat "$version_file")
case "$version" in
  ''|*[!0-9.]* ) fail "Invalid Android Bun version in $version_file: $version" ;;
esac
pkg="@oven/bun-linux-aarch64-android@$version"
target="$HOME/.local/share/maw/bun-$version"
binary="$target/bin/bun"

if [ -x "$binary" ]; then
  current=$("$binary" --version 2>/dev/null || true)
  if [ "$current" = "$version" ]; then
    printf 'MAW Bun bootstrap: already installed: %s (%s)\n' "$binary" "$current"
    exit 0
  fi
  fail "Existing Bun at $binary failed its pinned version check; not overwriting it."
fi
if [ -e "$target" ] || [ -L "$target" ]; then
  fail "Destination already exists: $target (not overwriting)."
fi

scratch=$(mktemp -d "$HOME/.maw-bun-download.XXXXXXXX") ||
  fail 'Could not create isolated download staging directory.'
trap 'rm -rf -- "$scratch"' EXIT HUP INT TERM
mkdir -p "$scratch/extract"
# npm pack downloads with integrity checking but does NOT run dependency install
# scripts; this breaks the npm prepare -> Bun bootstrap dependency cycle.
(
  cd "$scratch"
  npm pack --silent "$pkg" --pack-destination "$scratch"
) || fail "Unable to fetch official $pkg from npm registry."

archive="$scratch/oven-bun-linux-aarch64-android-$version.tgz"
[ -f "$archive" ] || fail "Official Android Bun archive not found: $archive"
tar -xzf "$archive" -C "$scratch/extract" ||
  fail 'Could not extract Android Bun archive.'

staged="$scratch/extract/package"
staged_bin="$staged/bin/bun"
[ -x "$staged_bin" ] || fail 'Archive has no executable Android Bun binary.'
actual=$("$staged_bin" --version 2>/dev/null || true)
[ "$actual" = "$version" ] ||
  fail "Android Bun cannot execute or returned unexpected version ($actual)."

mkdir -p "$(dirname "$target")"
if [ -e "$target" ] || [ -L "$target" ]; then
  fail "Destination appeared during download: $target (not overwriting)."
fi
mv "$staged" "$target" || fail 'Could not place isolated MAW Bun runtime.'
printf 'MAW Bun bootstrap: ready: %s (%s)\n' "$binary" "$version"
