#!/usr/bin/env bash
# The development stage of ADR-062 (item 3): on the 3,000 `dev2` seeds of each of the two classes (the same seeds in each; none of them was ever played), S and
# the six thresholds of the card reward of Act 2, each in 3,000 games per class: 6,000 games an arm, 42,000 in all. Resumable (a batch with a manifest is
# checked and never touched). Start from a clean checkout of the commit that carries the registration (part 1), and push nothing until it is done.
#   dev.sh <workers>        (PREFLIGHT_ONLY=1 stops after the checks; RESUME=1 finishes an interrupted stage, from the same commit)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export WORKERS=${1:-4}
source "$(dirname "${BASH_SOURCE[0]}")/preflight-dev.sh" || exit 1
[ -z "${PREFLIGHT_ONLY:-}" ] || exit 0
exec 9> "$OUT/dev.lock"
flock -n 9 || { echo "dev: another stage holds $OUT/dev.lock" >&2; exit 1; }
here=$(git rev-parse HEAD)
if [ -f "$OUT/dev-head.txt" ]; then
  [ "$(cat "$OUT/dev-head.txt")" = "$here" ] || { echo "dev: this stage started from $(cat "$OUT/dev-head.txt"), not from $here" >&2; exit 1; }
else
  echo "$here" > "$OUT/dev-head.txt"
fi
export STUDY_HEAD=$here
for arm in s $GRID_TAGS; do   # S first: whatever stops the stage, the baseline of every comparison exists
  for C in $CLASSES; do
    run_batch "$(dev_id "$arm" "$C")" "$(arm_policy "$arm")" "$(arm_params "$arm" "$C")" "$C" "$DEV_PARTITION" "$DEV_N" 0 || exit $?
  done
  echo "DEV_${arm}_DONE" >> "$OUT/run-done.txt"
done
echo DEV_DONE >> "$OUT/run-done.txt"
echo DEV_DONE
