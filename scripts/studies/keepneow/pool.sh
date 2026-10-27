#!/usr/bin/env bash
# The comparisons of ADR-055, each class on its own, then the pooled tests (exact McNemar over the five classes), run once: the primary
# (the new values against the baseline) and the secondary (the values of ADR-049 against the same baseline).
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
for arm in keepvals oldvals; do
  args=""
  for C in $CLASSES; do
    l=$(lower "$C")
    a="experiments/batches/rules_v2_neow_values-$arm-$l-a0-veteran-keeprelics-val-n2000"; b="experiments/batches/rules_v2-$l-a0-veteran-keeprelics-val-n2000"
    mkdir -p experiments/neow/per-class
    "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/neow/per-class/$l-neow-values-$arm-vs-rules_v2-keeprelics-val.json"
    args="$args --pair $a $b"
  done
  case "$arm" in keepvals) name=keep-v1 ;; oldvals) name=v2 ;; esac
  "$PY" -m slay2_sim pool $args --iters 20000 --out "experiments/neow/pooled-neow-values-$name-vs-rules_v2-keeprelics-val.json"
  sha256sum "experiments/neow/pooled-neow-values-$name-vs-rules_v2-keeprelics-val.json"
done
