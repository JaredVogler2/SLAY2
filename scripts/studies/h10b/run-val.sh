#!/usr/bin/env bash
# The held-out arms: rules_v2_neow_values on the 2,000 val seeds of each class against the frozen values file. Start only after
# the file's SHA-256 is in ADR-049 and on the remote, with no tracked file modified (the manifest records `dirty`).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
W=${1:-4}
for C in $CLASSES; do
  L=$(echo "$C" | tr 'A-Z' 'a-z')
  nice -n 8 "$PY" -m slay2_sim run --policy rules_v2_neow_values --policy-params "$(policy_params "$C" ',"neow_values":"experiments/neow/neow-values-v2.json"')" \
    --character "$C" --ascension 0 --profile veteran --seeds "$SEEDS" --partition val --n 2000 \
    --workers "$W" --trace 0 --batch-id "rules_v2_neow_values-$L-a0-veteran-val-n2000" > "$OUT/val-$L.log" 2>&1
  echo "VAL_${L}_EXIT=$?" >> "$OUT/val-done.txt"
done
