#!/usr/bin/env bash
# Stage B2-dev (ADR-050): advisor_v1 arms on the development seeds dev[4000:5000] of each class, A0, veteran profile.
#   run-dev.sh 1 <workers>          phase 1: arms d0..d4
#   CHOSEN='"needs":1,"scalers":0.7,"engines":0.25' run-dev.sh 2 <workers>    phase 2: the chosen config with a skip margin of 1.5 and 3
# Batches land in experiments/batches/. Start from a clean checkout of the registered commit (the manifest records `dirty`).
# Resumable: a batch that has a manifest is never touched, and the runner continues an interrupted batch from the games it had written
# (the games are determined by their seeds), so after a restart the same command finishes the phase.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
PHASE=${1:?phase 1 or 2}
W=${2:-4}
run_arm() { # <arm id> <params json>
  local arm=$1 params=$2 c l
  for c in $CLASSES; do
    l=$(echo "$c" | tr 'A-Z' 'a-z')
    [ -f "experiments/batches/advisor_v1-$arm-$l-a0-veteran-dev-o$DEV_OFFSET-n$DEV_N/manifest.json" ] && continue
    nice -n 8 "$PY" -m slay2_sim run --policy advisor_v1 --policy-params "$params" \
      --character "$c" --ascension 0 --profile veteran --seeds "$SEEDS" --partition dev --offset "$DEV_OFFSET" --n "$DEV_N" \
      --workers "$W" --trace 0 --batch-id "advisor_v1-$arm-$l-a0-veteran-dev-o$DEV_OFFSET-n$DEV_N" > "$OUT/dev-$arm-$l.log" 2>&1
    echo "DEV_${arm}_${l}_EXIT=$?" >> "$OUT/dev-done.txt"   # exit code 2 means some episodes ended in a simulator error, which is normal
  done
}
case "$PHASE" in
  1) for arm in d0 d1 d2 d3 d4; do run_arm "$arm" "$(arm_params "$arm")"; done ;;
  2) : "${CHOSEN:?CHOSEN is the chosen config as a JSON fragment, e.g. '\"needs\":1,\"scalers\":0.7,\"engines\":0.25'}"
     run_arm m1 "{${CHOSEN},\"margin\":1.5}"
     run_arm m2 "{${CHOSEN},\"margin\":3.0}" ;;
  *) echo "phase 1 or 2" >&2; exit 2 ;;
esac
