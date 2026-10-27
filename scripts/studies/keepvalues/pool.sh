#!/usr/bin/env bash
# The comparisons (ADR-053 item 4): each class on its own, then the one pooled test (exact McNemar over the five classes), run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
args=""
for C in $CLASSES; do
  l=$(lower "$C")
  a="experiments/batches/rules_v3-keepvals-$l-a0-veteran-keeprelics-val-n2000"; b="experiments/batches/rules_v3-curvals-$l-a0-veteran-keeprelics-val-n2000"
  "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/comparisons/rules_v3-keepvals-vs-curvals-$l-a0-veteran-keeprelics-val.json"
  args="$args --pair $a $b"
done
"$PY" -m slay2_sim pool $args --iters 20000 --out experiments/cardvalue/pooled-keepvals-vs-curvals-val.json
sha256sum experiments/cardvalue/pooled-keepvals-vs-curvals-val.json
