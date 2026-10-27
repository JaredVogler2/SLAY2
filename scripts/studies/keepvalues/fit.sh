#!/usr/bin/env bash
# The one fit per class (ADR-053 item 2) and the descriptive comparison with the values the site shows now (item 3). Prints the SHA-256 of
# each new file: they go into ADR-053 and must be pushed before any val game of this study.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
for C in $CLASSES; do
  id=$(explore_id "$C"); l=$(lower "$C")
  [ -f "experiments/cardvalue/$id/manifest.json" ] || { echo "fit: no exploration batch for $C" >&2; exit 1; }
  "$PY" -m slay2_sim.cardvalue --batches "experiments/cardvalue/$id" --out "$(new_values "$C")" --bootstrap 200 > "$OUT/fit-$l.log" 2>&1 || exit 1
  "$PY" -m slay2_sim.cardcompare --a "$(current_values "$C")" --b "$(new_values "$C")" --batches-b "experiments/cardvalue/$id" \
    --out "experiments/cardvalue/compare-$l-a0-current-vs-keep-v1.json" > "$OUT/compare-$l.log" 2>&1 || exit 1
  sha256sum "$(new_values "$C")"
done
