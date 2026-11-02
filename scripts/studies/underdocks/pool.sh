#!/usr/bin/env bash
# The comparisons of ADR-064, each class on its own, then the three pooled tests (exact McNemar over the five classes, with the whole-seed
# interval of the pooled difference at the level the tests are read at), each run once:
#   T1  A* against d0* (the synergy term)           -> experiments/underdocks/pooled-ud-t1-synergy-astar-vs-d0star.json
#   T2  the shown card values against rules_v1      -> experiments/underdocks/pooled-ud-t2-values-shown-vs-rules_v1.json
#   T3  the opening-relic rule against the baseline -> experiments/underdocks/pooled-ud-t3-neow-keep-v1-vs-rules_v2.json
# It refuses to start unless all thirty batches are finished and audited (a passing sample audit of at least 40 games for each, every win
# re-derived) and nothing of the study's results exists yet.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
[ -n "${RESULTS:-}" ] && [ -n "${BATCHES:-}" ] || fail "common.sh did not set RESULTS and BATCHES"

ids=""
for C in $CLASSES; do ids="$ids $(arm_ids "$C")"; done
# shellcheck disable=SC2086
BATCHES="$BATCHES" "$PY" - $ids <<'EOF' || fail "a batch is not finished and audited (see above)"
import json, os, sys
from pathlib import Path

problems = []
for bid in sys.argv[1:]:
    d = Path(os.environ["BATCHES"]) / bid
    try:
        m = json.loads((d / "manifest.json").read_text())
    except Exception as e:  # noqa: BLE001
        problems.append(f"{bid}: no readable manifest ({e})")
        continue
    try:
        s = json.loads((d / "sample-audit.json").read_text())
        ok = (s["all_verified"] is True and s["verified"] == s["sample"]["drawn"] >= 40 and s["ledger"]["ok"] is True
              and s["batch_content_sha256"] == m["content_sha256"])
        if not ok:
            problems.append(f"{bid}: the sample audit does not pass")
    except Exception as e:  # noqa: BLE001
        problems.append(f"{bid}: no readable sample audit ({e})")
    wins = m["summary"]["counts"]["win"]
    if wins:
        try:
            w = json.loads((d / "wins-audit.json").read_text())
            if not (w["all_verified"] is True and w["wins_audited"] == w["wins_in_batch"] == wins):
                problems.append(f"{bid}: not every win is re-derived")
        except Exception as e:  # noqa: BLE001
            problems.append(f"{bid}: {wins} wins and no readable win audit ({e})")
for p in problems:
    print(p, file=sys.stderr)
sys.exit(1 if problems else 0)
EOF
for f in pooled-ud-t1-synergy-astar-vs-d0star pooled-ud-t2-values-shown-vs-rules_v1 pooled-ud-t3-neow-keep-v1-vs-rules_v2; do
  [ ! -e "$RESULTS/$f.json" ] || fail "$RESULTS/$f.json exists: each test is run once"
done
if ls "$RESULTS/per-class" 2>/dev/null | grep -Eq '\.json$'; then fail "$RESULTS/per-class holds output: the comparisons are run once"; fi
mkdir -p "$RESULTS/per-class"

pool_test() { # <test key> <file name> <position of arm a in the class's id list> <position of arm b>
  local key=$1 name=$2 ia=$3 ib=$4 args="" C l ids a b
  for C in $CLASSES; do
    l=$(lower "$C")
    read -r -a ids <<< "$(arm_ids "$C")"
    a="$BATCHES/${ids[$ia]}"; b="$BATCHES/${ids[$ib]}"
    "$PY" -m slay2_sim compare "$a" "$b" --out "$RESULTS/per-class/$key-$l.json" || fail "compare failed for $C ($key)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --confidence "$LEVEL_CONFIDENCE" --out "$RESULTS/$name.json" || fail "pool failed ($key)"
  sha256sum "$RESULTS/$name.json" || fail "cannot hash $name.json"
}
pool_test ud-t2 pooled-ud-t2-values-shown-vs-rules_v1 2 3
pool_test ud-t3 pooled-ud-t3-neow-keep-v1-vs-rules_v2 4 5
pool_test ud-t1 pooled-ud-t1-synergy-astar-vs-d0star 0 1
echo POOL_DONE
