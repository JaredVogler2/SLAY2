#!/usr/bin/env bash
# Registered exploration: rules_v2_neow with neow_explore 1 on the first N (3,000) train seeds, A0, veteran, EXACT class ids.
# usage: explore.sh <workers> <ExactClass>...        (N=3000 by default; a smaller N gives a smoke test with another batch id)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-3}; shift
N=${N:-3000}
for C in "$@"; do
  L=$(echo "$C" | tr 'A-Z' 'a-z')
  nice -n 8 "$PY" -m slay2_sim run --policy rules_v2_neow --policy-params "$(policy_params "$C" ',"neow_explore":1.0')" \
    --character "$C" --ascension 0 --profile veteran --seeds "$SEEDS" --partition train --n "$N" \
    --workers "$W" --trace 0 --batch-id "neow-explore-$L-a0-train-n$N" --out "$OUT/explore-$L" > "$OUT/explore-$L.log" 2>&1
  echo "EXPLORE_${L}_EXIT=$?" >> "$OUT/explore-done.txt"   # exit code 2 means some episodes ended in a simulator error, which is normal
done
