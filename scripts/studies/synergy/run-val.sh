#!/usr/bin/env bash
# Stage B2-val (ADR-050): the 2,000 val seeds of each class, A0, veteran profile. Start only after the addendum that records A*
# is on the remote, from a clean checkout of the commit that carries it (the manifest records `dirty`), and only once.
#   ASTAR="$(python -m slay2_sim.synergydev --astar --dir experiments/synergy/dev)" MARGIN=<its margin> run-val.sh <workers>
#   RESUME=1 (same command) finishes a run that was interrupted: a batch with a manifest is never touched, an interrupted one continues from the games it wrote.
# Arms for every class: A* (astar); d0* (d0star: no synergy term, A*'s margin: the primary contrast changes the term and nothing
# else); d0 (no synergy term, margin 0) only when the margin is not 0; and the reference R (rules_v3 with the class's measured card
# values) for the four classes that have no rules_v3 batch on these seeds (Ironclad's: rules_v3-values2-ironclad-a0-veteran-val-n2000).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
: "${ASTAR:?ASTAR is the registered configuration of A* as a JSON object}"
W=${1:-3}
MARGIN=${MARGIN:-0}
source "$(dirname "${BASH_SOURCE[0]}")/preflight-val.sh" || exit 1   # stops here unless the addendum is public and A* is what it records
[ -z "${PREFLIGHT_ONLY:-}" ] || exit 0
run() { # <batch id> <policy> <params json> <ExactClass>
  [ -f "experiments/batches/$1/manifest.json" ] && return 0   # finished: never touched (RESUME=1 finishes an interrupted run)
  nice -n 8 "$PY" -m slay2_sim run --policy "$2" --policy-params "$3" --character "$4" --ascension 0 --profile veteran \
    --seeds "$SEEDS" --partition val --n 2000 --workers "$W" --trace 0 --batch-id "$1" > "$OUT/val-$1.log" 2>&1
  local status=$?
  echo "VAL_${1}_EXIT=$status" >> "$OUT/val-done.txt"
  # exit code 2 means some episodes ended in a simulator error, which is normal; anything else stops the run (RESUME=1 continues it)
  if [ "$status" != 0 ] && [ "$status" != 2 ]; then echo "run-val: $1 failed with status $status (see $OUT/val-$1.log)" >&2; exit "$status"; fi
}
for C in $CLASSES; do
  L=$(echo "$C" | tr 'A-Z' 'a-z')
  run "advisor_v1-astar-$L-a0-veteran-val-n2000" advisor_v1 "$ASTAR" "$C"
  run "advisor_v1-d0star-$L-a0-veteran-val-n2000" advisor_v1 "{\"synergy\":0,\"margin\":$MARGIN}" "$C"
  if margin_is_set "$MARGIN"; then
    run "advisor_v1-d0-$L-a0-veteran-val-n2000" advisor_v1 "$(arm_params d0)" "$C"
  fi
  if [ "$C" != Ironclad ]; then
    run "rules_v3-$L-a0-veteran-val-n2000" rules_v3 "{\"threshold\":0.0,\"values\":\"experiments/cardvalue/${L}-a0-v1.json\"}" "$C"
  fi
done
