#!/usr/bin/env bash
# The held-out arms of ADR-058: three tests, six arms, five classes, the 2,000 val seeds of each class, Ascension 9, the relics kept, veteran
# (60,000 games), then the twin of T2 at Ascension 0 with the relics kept (20,000 games, descriptive). The order is T2, T3, T1, the twin; the
# order decides nothing. Every batch is checked against its own manifest when it ends (common.sh, verify_batch), and the run stops at the first
# one that is not what ADR-058 says.
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

val() { run_batch "$1" "$2" "$3" "$4" val 2000 0 "$5" || exit $?; }   # <batch id> <policy> <params json> <ExactClass> <ascension>
for C in $CLASSES; do
  read -r id_astar id_d0star id_shown id_v1 id_neow id_base <<< "$(arm_ids "$C")"
  val "$id_shown" rules_v2 "$(shown_params "$C")" "$C" 9
  val "$id_v1"    rules_v1 "{}" "$C" 9
done
echo VAL_T2_DONE >> "$OUT/run-done.txt"
for C in $CLASSES; do
  read -r id_astar id_d0star id_shown id_v1 id_neow id_base <<< "$(arm_ids "$C")"
  val "$id_neow" rules_v2_neow_values "$(base_params "$C" ",\"neow_values\":\"$NEOW_VALUES\"")" "$C" 9
  val "$id_base" rules_v2 "$(base_params "$C" "")" "$C" 9
done
echo VAL_T3_DONE >> "$OUT/run-done.txt"
for C in $CLASSES; do
  read -r id_astar id_d0star id_shown id_v1 id_neow id_base <<< "$(arm_ids "$C")"
  val "$id_astar"  advisor_v1 "$ASTAR" "$C" 9
  val "$id_d0star" advisor_v1 "$D0STAR" "$C" 9
done
echo VAL_T1_DONE >> "$OUT/run-done.txt"
echo VAL_PRIMARY_DONE >> "$OUT/run-done.txt"
# the twin of T2: the same two arms in the game of the earlier studies (Ascension 0, the relics kept)
for C in $CLASSES; do
  read -r twin_shown twin_v1 <<< "$(twin_ids "$C")"
  val "$twin_shown" rules_v2 "$(shown_params "$C")" "$C" 0
  val "$twin_v1"    rules_v1 "{}" "$C" 0
done
echo VAL_TWIN_DONE >> "$OUT/run-done.txt"
echo VAL_DONE >> "$OUT/run-done.txt"
