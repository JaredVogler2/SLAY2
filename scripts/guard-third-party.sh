#!/usr/bin/env bash
# guard-third-party.sh - refuse to commit rights-restricted / third-party game material.
#
# SLAY2 may *read* external repositories locally (see external/pins.json and
# docs/IP-COMPLIANCE.md) but must never vendor their code, decompiled game
# sources, extracted game files, or bulk extracted data into this repository.
#
# Usage:
#   scripts/guard-third-party.sh staged    # pre-commit: checks the git index (default)
#   scripts/guard-third-party.sh tracked   # CI: checks every tracked file
#
# Exit status: 0 = clean, 1 = violation(s) found, 2 = usage / environment error.
set -euo pipefail

mode="${1:-staged}"
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "guard: not inside a git repository" >&2; exit 2; }
cd "$root"

case "$mode" in
  staged)  list_cmd=(git diff --cached --name-only --diff-filter=ACMR -z) ;;
  tracked) list_cmd=(git ls-files -z) ;;
  *) echo "usage: $0 [staged|tracked]" >&2; exit 2 ;;
esac

# Paths that must never be committed.
forbidden_path_re='(^|/)(decompiled|extracted_pck|external/checkouts|external/venvs)(/|$)|\.(pck|dll|exe|so|dylib|ctex|assetbundle)$'
# Env files (except the example template).
env_file_re='(^|/)\.env(\.[A-Za-z0-9_-]+)?$'
# C# is not part of this repository today; any .cs file must be explicitly allow-listed.
allowlist="scripts/third-party-allowlist.txt"
# Header lines that betray pasted decompiled game code.
decompiled_header_re='^[[:space:]]*(using|namespace)[[:space:]]+(MegaCrit|Godot)\.'

violations=0
report() { echo "guard: VIOLATION: $1" >&2; violations=$((violations + 1)); }

read_file() {  # print the content that would be committed
  if [ "$mode" = "staged" ]; then git show ":$1" 2>/dev/null || true; else cat -- "$1" 2>/dev/null || true; fi
}

while IFS= read -r -d '' f; do
  # self-exemption: this script and its test contain the patterns by necessity.
  case "$f" in scripts/guard-third-party.sh|scripts/test-guard.sh) continue ;; esac

  if [[ "$f" =~ $forbidden_path_re ]]; then
    report "forbidden path (third-party / game artifact): $f"
    continue
  fi
  if [[ "$f" =~ $env_file_re ]] && [[ "$f" != *".env.example" ]]; then
    report "env file must not be committed: $f"
    continue
  fi
  if [[ "$f" == *.cs ]]; then
    if [ -f "$allowlist" ] && grep -qxF "$f" "$allowlist"; then :; else
      report "C# source not allow-listed (possible decompiled game code): $f"
      continue
    fi
  fi
  # Content scan of text files only (skip binaries, large blobs).
  if read_file "$f" | head -c 2000000 | LC_ALL=C grep -qI '[^[:space:]]'; then
    if read_file "$f" | head -c 2000000 | LC_ALL=C grep -E -q "$decompiled_header_re"; then
      report "decompiled-game-code header found in: $f"
    fi
  fi
done < <("${list_cmd[@]}")

if [ "$violations" -gt 0 ]; then
  echo "guard: $violations violation(s). See docs/IP-COMPLIANCE.md. Nothing third-party may enter this repo." >&2
  exit 1
fi
echo "guard: clean ($mode)"
