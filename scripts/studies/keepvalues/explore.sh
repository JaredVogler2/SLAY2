#!/usr/bin/env bash
# Registered exploration (ADR-053 item 1): rules_explore_v3, explore 0.6, the relics kept, dev[5000:10000] of every class, A0, veteran.
# Start from a clean checkout of the commit that carries ADR-053 (the manifest records `dirty`). Resumable: a batch with a manifest is never touched.
#   explore.sh <workers> [ExactClass...]        (all five classes by default)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-4}; shift
for C in ${@:-$CLASSES}; do
  id=$(explore_id "$C")
  [ -f "experiments/cardvalue/$id/manifest.json" ] && continue
  nice -n 8 "$PY" -m slay2_sim run --policy rules_explore_v3 --policy-params "{\"explore\":0.6,\"replicate\":0,\"values\":\"$(first_values "$C")\"}" \
    --character "$C" --ascension 0 --profile veteran --seeds "$SEEDS" --partition dev --offset 5000 --n 5000 --keep-relics \
    --workers "$W" --trace 0 --batch-id "$id" --out "experiments/cardvalue/$id" > "$OUT/explore-$(lower "$C").log" 2>&1
  rc=$?   # read before the command substitution below resets it
  echo "EXPLORE_$(lower "$C")_EXIT=$rc" >> "$OUT/explore-done.txt"   # exit code 2 means some episodes ended in a simulator error, which is normal
done
echo EXPLORE_DONE >> "$OUT/explore-done.txt"
