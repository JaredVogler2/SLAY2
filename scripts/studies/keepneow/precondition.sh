#!/usr/bin/env bash
# Precondition of ADR-055 (item 7), on development seeds: `rules_v2_neow` with exploration off plays exactly as `rules_v2` with the relics kept.
# 200 dev seeds per class, exact class ids, both arms with --keep-relics; then precondition_compare.py compares the two episode files per seed.
# The dev seeds are not held-out data; nothing here is evidence of anything but that the two policies play alike.
#   precondition.sh <workers>
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-2}
DIR=experiments/neow/precondition-keep
for C in $CLASSES; do
  l=$(lower "$C")
  [ -f "$DIR/v2-$l/manifest.json" ] || nice -n 8 "$PY" -m slay2_sim run --policy rules_v2 --policy-params "$(policy_params "$C" "")" \
    --character "$C" --ascension 0 --profile veteran --seeds "$SEEDS" --partition dev --n 200 --keep-relics --workers "$W" --trace 0 \
    --batch-id "pre-v2-$l" --out "$DIR/v2-$l" > "$OUT/pre-v2-$l.log" 2>&1
  [ -f "$DIR/neow0-$l/manifest.json" ] || nice -n 8 "$PY" -m slay2_sim run --policy rules_v2_neow --policy-params "$(policy_params "$C" ',"neow_explore":0.0')" \
    --character "$C" --ascension 0 --profile veteran --seeds "$SEEDS" --partition dev --n 200 --keep-relics --workers "$W" --trace 0 \
    --batch-id "pre-neow0-$l" --out "$DIR/neow0-$l" > "$OUT/pre-neow0-$l.log" 2>&1
done
"$PY" -I "$(dirname "${BASH_SOURCE[0]}")/precondition_compare.py" --dir "$DIR" --out experiments/neow/precondition-keep.json
