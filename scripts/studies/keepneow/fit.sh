#!/usr/bin/env bash
# The one fit (ADR-055 item 2) and the descriptive comparison with the values of ADR-049 (item 3). Prints the SHA-256 of the new file: it goes
# into ADR-055 and must be pushed before any val game of this study.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
batches=""
for C in $CLASSES; do
  dir=$(explore_dir "$C")
  [ -f "$dir/manifest.json" ] || { echo "fit: no exploration batch for $C" >&2; exit 1; }
  batches="$batches $dir"
done
"$PY" -m slay2_sim.neowvalue --batches $batches --out "$NEW_VALUES" --bootstrap 200 --min-taken 30 || exit 1
"$PY" -m slay2_sim.neowcompare --a "$OLD_VALUES" --b "$NEW_VALUES" --batches-b $batches --out experiments/neow/compare-v2-keep-v1.json || exit 1
sha256sum "$NEW_VALUES"
