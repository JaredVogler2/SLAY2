#!/usr/bin/env bash
# The held-out arms (ADR-053 item 4): rules_v3 with the new values and with the current values, the relics kept, the 2,000 val seeds of each class.
#   run-val.sh <workers>        (PREFLIGHT_ONLY=1 stops after the checks; RESUME=1 finishes an interrupted run)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-4}
source "$(dirname "${BASH_SOURCE[0]}")/preflight-val.sh" || exit 1
[ -z "${PREFLIGHT_ONLY:-}" ] || exit 0
run() { # <batch id> <values file> <ExactClass>
  [ -f "experiments/batches/$1/manifest.json" ] && return 0   # finished: never touched
  nice -n 8 "$PY" -m slay2_sim run --policy rules_v3 --policy-params "{\"threshold\":0.0,\"values\":\"$2\"}" \
    --character "$3" --ascension 0 --profile veteran --seeds "$SEEDS" --partition val --n 2000 --keep-relics \
    --workers "$W" --trace 0 --batch-id "$1" > "$OUT/val-$1.log" 2>&1
  local status=$?
  echo "VAL_${1}_EXIT=$status" >> "$OUT/val-done.txt"
  # exit code 2 means some episodes ended in a simulator error, which is normal; anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run-val: $1 failed with status $status (see $OUT/val-$1.log)" >&2; exit "$status"; fi
}
for C in $CLASSES; do
  l=$(lower "$C")
  run "rules_v3-keepvals-$l-a0-veteran-keeprelics-val-n2000" "$(new_values "$C")" "$C"
  run "rules_v3-curvals-$l-a0-veteran-keeprelics-val-n2000" "$(current_values "$C")" "$C"
done
echo VAL_DONE >> "$OUT/val-done.txt"
