#!/usr/bin/env bash
# Precondition of ADR-058 (item 6), on development seeds: do the six arms of the study play at Ascension 9, in every class, with the relics kept?
# 100 dev seeds per class and arm (dev[0:100)), exact class ids; the comparator is the shown-values pilot at Ascension 0 on the same seeds.
# The dev seeds are not held-out data; nothing here is evidence of anything but that the arms run and that the Ascension is in force.
#   precondition.sh <workers>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export WORKERS=${1:-4}
DIR=experiments/ascension9/precondition
for C in $CLASSES; do
  l=$(lower "$C")
  run_batch "pre-a9-astar-$l"   advisor_v1         "$ASTAR"  "$C" dev 100 0 9 "$DIR/astar-$l"
  run_batch "pre-a9-d0star-$l"  advisor_v1         "$D0STAR" "$C" dev 100 0 9 "$DIR/d0star-$l"
  run_batch "pre-a9-shown-$l"   rules_v2           "$(shown_params "$C")" "$C" dev 100 0 9 "$DIR/shown-$l"
  run_batch "pre-a9-v1-$l"      rules_v1           "{}" "$C" dev 100 0 9 "$DIR/v1-$l"
  run_batch "pre-a9-neow-$l"    rules_v2_neow_values "$(base_params "$C" ",\"neow_values\":\"$NEOW_VALUES\"")" "$C" dev 100 0 9 "$DIR/neow-$l"
  run_batch "pre-a9-base-$l"    rules_v2           "$(base_params "$C" "")" "$C" dev 100 0 9 "$DIR/base-$l"
  run_batch "pre-a0-shown-$l"   rules_v2           "$(shown_params "$C")" "$C" dev 100 0 0 "$DIR/a0shown-$l"
done
"$PY" -I "$(dirname "${BASH_SOURCE[0]}")/precondition_report.py" --dir "$DIR" --out experiments/ascension9/precondition.json
