#!/usr/bin/env bash
# The primary test, run once: the five held-out arms against the five stored rules_v2 baselines, pooled, exact McNemar.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
args=""
for c in ironclad silent regent necrobinder defect; do
  args="$args --pair experiments/batches/rules_v2_neow_values-$c-a0-veteran-val-n2000 experiments/batches/rules_v2-$c-a0-veteran-val-n2000"
done
"$PY" -m slay2_sim pool $args --iters 20000 --out experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json
sha256sum experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json
