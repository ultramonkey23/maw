#!/bin/sh
# Install/update MAW source launchers in the user's Termux PATH.
# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 43
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P) || exit 43
bin_dir=${MAW_BIN_DIR:-"$HOME/bin"}
source_launcher="$repo_root/scripts/maw-termux.sh"

[ -f "$source_launcher" ] || {
  printf 'MAW launcher install: missing %s\n' "$source_launcher" >&2
  exit 43
}

mkdir -p "$bin_dir"

install_launcher() {
  name=$1
  mode=$2
  target="$bin_dir/$name"

  if [ -L "$target" ]; then
    printf 'MAW launcher install: refusing to replace symlink %s\n' "$target" >&2
    exit 2
  fi
  if [ -e "$target" ]; then
    if [ ! -f "$target" ]; then
      printf 'MAW launcher install: refusing to replace non-file %s\n' "$target" >&2
      exit 2
    fi
    if ! grep -Fq '# MAW managed launcher' "$target" &&
       ! grep -Fq 'scripts/maw-termux.sh' "$target"; then
      printf 'MAW launcher install: refusing to replace unmanaged %s\n' "$target" >&2
      exit 2
    fi
  fi

  tmp="$target.tmp.$$"
  {
    printf '%s\n' '#!/bin/sh'
    printf '# MAW managed launcher; source: %s\n' "$repo_root"
    if [ "$mode" = 'lab' ]; then
      printf 'MAW_LAB_MODE=on LLXPRT_SANDBOX=false exec sh "%s" "$@"\n' "$source_launcher"
    else
      printf 'exec sh "%s" "$@"\n' "$source_launcher"
    fi
  } > "$tmp"
  chmod +x "$tmp"
  mv -f "$tmp" "$target"
  printf 'Installed %s\n' "$target"
}

install_launcher maw standalone
install_launcher maw-lab lab
install_launcher lab-maw lab

printf 'MAW commands ready: maw, maw-lab, lab-maw\n'
