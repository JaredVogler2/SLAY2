#!/usr/bin/env bash
# Registered exploration (ADR-055 item 1): rules_v2_neow with neow_explore 1, the relics kept, the first 3,000 train seeds of every class,
# A0, veteran, EXACT class ids. Start from a clean checkout of the commit that carries ADR-055 (the manifest records `dirty`).
# Resumable: a batch with a manifest is never touched.
#   explore.sh <workers> [ExactClass...]        (all five classes by default)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-4}; shift
for C in ${@:-$CLASSES}; do
  id=$(explore_id "$C")
  dir=$(explore_dir "$C")
  [ -f "$dir/manifest.json" ] && continue
  nice -n 8 "$PY" -m slay2_sim run --policy rules_v2_neow --policy-params "$(policy_params "$C" ',"neow_explore":1.0')" \
    --character "$C" --ascension 0 --profile veteran --seeds "$SEEDS" --partition train --n 3000 --keep-relics \
    --workers "$W" --trace 0 --batch-id "$id" --out "$dir" > "$OUT/explore-$(lower "$C").log" 2>&1
  rc=$?   # read before the command substitution below resets it
  echo "EXPLORE_$(lower "$C")_EXIT=$rc" >> "$OUT/explore-done.txt"   # exit code 2 means some episodes ended in a simulator error, which is normal
done
echo EXPLORE_DONE >> "$OUT/explore-done.txt"
