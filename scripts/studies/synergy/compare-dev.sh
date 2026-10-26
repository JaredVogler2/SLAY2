#!/usr/bin/env bash
# Stage B2-dev: every arm against d0 (and the phase-2 arms against the chosen config's margin-0 arm), class by class and pooled.
# usage: compare-dev.sh <arm> <baseline arm>      e.g. compare-dev.sh d1 d0
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
A=${1:?arm}; B=${2:?baseline arm}
mkdir -p experiments/synergy/dev
args=""
for c in ironclad silent regent necrobinder defect; do
  a=experiments/batches/advisor_v1-$A-$c-a0-veteran-dev-o$DEV_OFFSET-n$DEV_N
  b=experiments/batches/advisor_v1-$B-$c-a0-veteran-dev-o$DEV_OFFSET-n$DEV_N
  args="$args --pair $a $b"
  "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/synergy/dev/$A-vs-$B-$c.json" > "$OUT/cmp-$A-vs-$B-$c.txt" 2>&1
done
"$PY" -m slay2_sim pool $args --iters 20000 --out "experiments/synergy/dev/$A-vs-$B-pooled.json"
