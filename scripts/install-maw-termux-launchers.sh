#!/bin/sh
# Install/update MAW source launchers in the user's Termux PATH.
# Copyright 2026 Ultramonkeydog. SPDX-License-Identifier: Apache-2.0
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 43
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P) || exit 43
bin_dir=${MAW_BIN_DIR:-"$HOME/bin"}
source_launcher="$repo_root/scripts/maw-termux.sh"
managed_marker='# MAW managed launcher'

[ -f "$source_launcher" ] || {
  printf 'MAW launcher install: missing %s\n' "$source_launcher" >&2
  exit 43
}

mkdir -p "$bin_dir"

launcher_state() {
  target=$1
  if [ -L "$target" ]; then
    printf '%s\n' symlink
  elif [ ! -e "$target" ]; then
    printf '%s\n' missing
  elif [ ! -f "$target" ]; then
    printf '%s\n' nonfile
  elif grep -Fq "$managed_marker" "$target"; then
    printf '%s\n' managed
  elif grep -Fq 'scripts/maw-termux.sh' "$target"; then
    printf '%s\n' legacy
  else
    printf '%s\n' unrelated
  fi
}

validate_existing() {
  target=$1
  state=$(launcher_state "$target")
  case "$state" in
    missing|managed|legacy) ;;
    symlink)
      printf 'MAW launcher install: refusing to replace symlink %s\n' "$target" >&2
      exit 2
      ;;
    nonfile)
      printf 'MAW launcher install: refusing to replace non-file %s\n' "$target" >&2
      exit 2
      ;;
    *)
      printf 'MAW launcher install: refusing to replace unrelated %s\n' "$target" >&2
      exit 2
      ;;
  esac
}

write_managed_body() {
  output=$1
  mode=$2
  {
    printf '%s\n' '#!/bin/sh'
    printf '# MAW managed launcher; source: %s\n' "$repo_root"
    if [ "$mode" = 'lab' ]; then
      printf 'MAW_LAB_MODE=on LLXPRT_SANDBOX=false exec sh "%s" "$@"\n' "$source_launcher"
    else
      printf 'exec sh "%s" "$@"\n' "$source_launcher"
    fi
  } > "$output"
}

install_or_preserve() {
  name=$1
  mode=$2
  target="$bin_dir/$name"
  validate_existing "$target"
  state=$(launcher_state "$target")

  tmp="$target.tmp.$$"
  write_managed_body "$tmp" "$mode"
  chmod +x "$tmp"

  case "$state" in
    missing)
      mv "$tmp" "$target"
      printf 'Installed %s\n' "$target"
      ;;
    managed)
      if cmp -s "$target" "$tmp"; then
        rm -f "$tmp"
        printf 'Current %s\n' "$target"
      else
        rm -f "$tmp"
        printf 'Preserved modified managed launcher %s\n' "$target"
      fi
      ;;
    legacy)
      rm -f "$tmp"
      printf 'Preserved existing customized launcher %s\n' "$target"
      ;;
  esac
}

clone_missing_lab_peer() {
  first="$bin_dir/maw-lab"
  second="$bin_dir/lab-maw"
  validate_existing "$first"
  validate_existing "$second"
  first_state=$(launcher_state "$first")
  second_state=$(launcher_state "$second")

  if [ "$first_state" = missing ] && [ "$second_state" != missing ]; then
    cp "$second" "$first"
    chmod +x "$first"
    printf 'Cloned existing Lab launcher behavior to %s\n' "$first"
  elif [ "$second_state" = missing ] && [ "$first_state" != missing ]; then
    cp "$first" "$second"
    chmod +x "$second"
    printf 'Cloned existing Lab launcher behavior to %s\n' "$second"
  fi
}

install_or_preserve maw standalone
clone_missing_lab_peer
install_or_preserve maw-lab lab
install_or_preserve lab-maw lab

if [ -f "$bin_dir/maw-lab" ] && [ -f "$bin_dir/lab-maw" ] &&
   ! cmp -s "$bin_dir/maw-lab" "$bin_dir/lab-maw"; then
  printf '%s\n' 'MAW launcher install: maw-lab and lab-maw differ; preserved both rather than discarding custom behavior.' >&2
fi

printf 'MAW commands ready: maw, maw-lab, lab-maw\n'
