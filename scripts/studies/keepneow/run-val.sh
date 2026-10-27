#!/usr/bin/env bash
# The held-out arms (ADR-055 items 4 and 5), the relics kept, the 2,000 val seeds of each class, Ascension 0, veteran: first the two arms of the
# primary test for every class (the new values; the baseline `rules_v2`, the first helpful relic), then the secondary arm (the values of ADR-049).
#   run-val.sh <workers>        (PREFLIGHT_ONLY=1 stops after the checks; RESUME=1 finishes an interrupted run)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-4}
source "$(dirname "${BASH_SOURCE[0]}")/preflight-val.sh" || exit 1
[ -z "${PREFLIGHT_ONLY:-}" ] || exit 0
run() { # <batch id> <policy> <params json> <ExactClass>
  [ -f "experiments/batches/$1/manifest.json" ] && return 0   # finished: never touched
  nice -n 8 "$PY" -m slay2_sim run --policy "$2" --policy-params "$3" --character "$4" --ascension 0 --profile veteran \
    --seeds "$SEEDS" --partition val --n 2000 --keep-relics --workers "$W" --trace 0 --batch-id "$1" > "$OUT/val-$1.log" 2>&1
  local status=$?
  echo "VAL_${1}_EXIT=$status" >> "$OUT/val-done.txt"
  # exit code 2 means some episodes ended in a simulator error, which is normal; anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run-val: $1 failed with status $status (see $OUT/val-$1.log)" >&2; exit "$status"; fi
}
for C in $CLASSES; do
  l=$(lower "$C")
  run "rules_v2_neow_values-keepvals-$l-a0-veteran-keeprelics-val-n2000" rules_v2_neow_values "$(policy_params "$C" ",\"neow_values\":\"$NEW_VALUES\"")" "$C"
  run "rules_v2-$l-a0-veteran-keeprelics-val-n2000" rules_v2 "$(policy_params "$C" "")" "$C"
done
echo VAL_PRIMARY_DONE >> "$OUT/val-done.txt"
for C in $CLASSES; do
  l=$(lower "$C")
  run "rules_v2_neow_values-oldvals-$l-a0-veteran-keeprelics-val-n2000" rules_v2_neow_values "$(policy_params "$C" ",\"neow_values\":\"$OLD_VALUES\"")" "$C"
done
echo VAL_DONE >> "$OUT/val-done.txt"
