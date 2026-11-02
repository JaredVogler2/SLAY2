#!/usr/bin/env bash
# The held-out arm of ADR-065: the pilot that charges for a slot (S1), five classes, the 2,000 val seeds of each class, Ascension 0, the relics kept,
# veteran, in one Act 1 at a time (10,000 games a leg). The baselines (S0) are batches that exist: Overgrowth's are ADR-054's, Underdocks's are the T1
# arm `A*` of ADR-064, which has to be finished and audited before the Underdocks leg starts. Every batch is checked against its own manifest when it
# ends (common.sh, verify_batch), and the run stops at the first one that is not what ADR-065 says.
#   run-val.sh <leg: og | ud> <workers>        (PREFLIGHT_ONLY=1 stops after the checks; RESUME=1 finishes an interrupted run, from the same commit)
LEG=${1:-}
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
case "$LEG" in og | ud) ;; *) echo "usage: run-val.sh <og|ud> [workers]" >&2; exit 2 ;; esac
export WORKERS=${2:-4}
source "$(dirname "${BASH_SOURCE[0]}")/preflight-val.sh" || exit 1
[ -z "${PREFLIGHT_ONLY:-}" ] || exit 0

# one run at a time, and one commit for the whole leg: a resumed run has to start from the commit the first one did
exec 9> "$OUT/run.lock"
flock -n 9 || { echo "run-val: another run holds $OUT/run.lock" >&2; exit 1; }
here=$(git rev-parse HEAD)
if [ -f "$OUT/run-head-$LEG.txt" ]; then
  [ "$(cat "$OUT/run-head-$LEG.txt")" = "$here" ] || { echo "run-val: this leg started from $(cat "$OUT/run-head-$LEG.txt"), not from $here" >&2; exit 1; }
else
  echo "$here" > "$OUT/run-head-$LEG.txt"
fi
export STUDY_HEAD=$here

for C in $CLASSES; do
  run_batch "$(s1_id "$C" "$LEG")" "$LEG" "$C" val 2000 0 || exit $?
done
echo "VAL_${LEG}_DONE" >> "$OUT/run-done.txt"
