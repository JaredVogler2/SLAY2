#!/usr/bin/env bash
# The comparisons of ADR-054: each class on its own, then the one pooled test (exact McNemar over the five classes), run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
args=""
for C in $CLASSES; do
  l=$(lower "$C")
  a="experiments/batches/advisor_v1-astar-$l-a0-veteran-keeprelics-val-n2000"; b="experiments/batches/advisor_v1-d0star-$l-a0-veteran-keeprelics-val-n2000"
  "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/comparisons/advisor_v1-astar-vs-d0star-$l-a0-veteran-keeprelics-val.json"
  args="$args --pair $a $b"
done
mkdir -p experiments/synergy/keep-val
"$PY" -m slay2_sim pool $args --iters 20000 --out experiments/synergy/keep-val/pooled-astar-vs-d0star.json
sha256sum experiments/synergy/keep-val/pooled-astar-vs-d0star.json
