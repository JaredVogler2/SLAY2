#!/usr/bin/env bash
# Stage B2-val: the primary test, run once (A* against d0, five classes pooled, exact McNemar), and the secondary pooled comparison of
# A* against the reference R. The five class-by-class comparisons are written beside them.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
mkdir -p experiments/synergy/val
primary=""; secondary=""
for c in ironclad silent regent necrobinder defect; do
  a=experiments/batches/advisor_v1-astar-$c-a0-veteran-val-n2000
  d0=experiments/batches/advisor_v1-d0-$c-a0-veteran-val-n2000
  r=experiments/batches/rules_v3-$c-a0-veteran-val-n2000
  [ "$c" = ironclad ] && r=experiments/batches/rules_v3-values2-ironclad-a0-veteran-val-n2000
  primary="$primary --pair $a $d0"; secondary="$secondary --pair $a $r"
  "$PY" -m slay2_sim compare "$a" "$d0" --out "experiments/synergy/val/astar-vs-d0-$c.json" > "$OUT/cmp-val-astar-vs-d0-$c.txt" 2>&1
  "$PY" -m slay2_sim compare "$a" "$r" --out "experiments/synergy/val/astar-vs-rules_v3-$c.json" > "$OUT/cmp-val-astar-vs-r-$c.txt" 2>&1
done
"$PY" -m slay2_sim pool $primary --iters 20000 --out experiments/synergy/val/pooled-astar-vs-d0.json
"$PY" -m slay2_sim pool $secondary --iters 20000 --out experiments/synergy/val/pooled-astar-vs-rules_v3.json
sha256sum experiments/synergy/val/pooled-astar-vs-d0.json
