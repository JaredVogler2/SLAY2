#!/usr/bin/env bash
# Precondition of ADR-064 (item 7), on development seeds: do the six arms of the study play in Underdocks, in every class, with the relics kept?
# 100 dev seeds per class and arm (dev[0:100)), exact class ids; the comparator is the shown-values pilot in Overgrowth on the same seeds.
# The dev seeds are not held-out data; nothing here is evidence of anything but that the arms run, that Underdocks is in force and that the act
# can be got through at all.
#   precondition.sh <workers>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export WORKERS=${1:-4}
DIR=$RESULTS/precondition
pre() { run_batch "$1" "$2" "$3" "$4" dev 100 0 "$5" || exit $?; }   # <batch id> <policy> <params json> <ExactClass> <out dir>
for C in $CLASSES; do
  l=$(lower "$C")
  pre "pre-ud-astar-$l"  advisor_v1           "$ASTAR"  "$C" "$DIR/astar-$l"
  pre "pre-ud-d0star-$l" advisor_v1           "$D0STAR" "$C" "$DIR/d0star-$l"
  pre "pre-ud-shown-$l"  rules_v2             "$(shown_params "$C")" "$C" "$DIR/shown-$l"
  pre "pre-ud-v1-$l"     rules_v1             "{}" "$C" "$DIR/v1-$l"
  pre "pre-ud-neow-$l"   rules_v2_neow_values "$(base_params "$C" ",\"neow_values\":\"$NEOW_VALUES\"")" "$C" "$DIR/neow-$l"
  pre "pre-ud-base-$l"   rules_v2             "$(base_params "$C" "")" "$C" "$DIR/base-$l"
  # the comparator: the same pilot and seeds in Overgrowth (not a batch of the study: it is run by hand with the same command and no --act1)
  if [ ! -f "$DIR/ogshown-$l/manifest.json" ]; then
    guard_tree || exit 1
    nice -n 8 "$PY" -m slay2_sim run --policy rules_v2 --policy-params "$(shown_params "$C")" --character "$C" --ascension 0 --profile veteran \
      --seeds "$SEEDS" --partition dev --offset 0 --n 100 --keep-relics --workers "${WORKERS:-4}" --trace 0 --batch-id "pre-og-shown-$l" \
      --out "$DIR/ogshown-$l" >> "$OUT/dev-pre-og-shown-$l.log" 2>&1
    s=$?; [ "$s" = 0 ] || [ "$s" = 2 ] || { echo "precondition: comparator for $C failed with status $s" >&2; exit "$s"; }
  fi
done
"$PY" -I "$(dirname "${BASH_SOURCE[0]}")/precondition_report.py" --dir "$DIR" --out "$RESULTS/precondition.json"
