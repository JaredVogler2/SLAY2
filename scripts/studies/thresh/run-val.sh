#!/usr/bin/env bash
# The held-out arms of ADR-062: S, the threshold 0.2 (T1 replicates it) and, if the development screen advanced one, that threshold (T2 against S, T3 against 0.2);
# the two classes, the 10,000 val3 seeds of each, Ascension 0, the relics kept, veteran (20,000 games an arm). Every batch is checked against its own manifest when
# it ends, and the run stops at the first one that is not what ADR-062 says.
#   run-val.sh <workers>        (PREFLIGHT_ONLY=1 stops after the checks; RESUME=1 finishes an interrupted run, from the same commit)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
export WORKERS=${1:-4}
source "$(dirname "${BASH_SOURCE[0]}")/preflight-val.sh" || exit 1
[ -z "${PREFLIGHT_ONLY:-}" ] || exit 0

# one run at a time, and one commit for the whole run: a resumed run has to start from the commit the first one did
exec 9> "$OUT/run.lock"
flock -n 9 || { echo "run-val: another run holds $OUT/run.lock" >&2; exit 1; }
here=$(git rev-parse HEAD)
if [ -f "$OUT/run-head.txt" ]; then
  [ "$(cat "$OUT/run-head.txt")" = "$here" ] || { echo "run-val: this run started from $(cat "$OUT/run-head.txt"), not from $here" >&2; exit 1; }
else
  echo "$here" > "$OUT/run-head.txt"
fi
export STUDY_HEAD=$here

# S first, then 0.2, then the screen's choice: whatever stops the run, the baseline of every test exists
for arm in $ARMS; do
  for C in $CLASSES; do
    run_batch "$(val_id "$arm" "$C")" "$(arm_policy "$arm")" "$(arm_params "$arm" "$C")" "$C" "$VAL_PARTITION" "$VAL_N" 0 || exit $?
  done
  echo "VAL_${arm}_DONE" >> "$OUT/run-done.txt"
done
echo VAL_DONE >> "$OUT/run-done.txt"
