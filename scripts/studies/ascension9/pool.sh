#!/usr/bin/env bash
# The comparisons of ADR-058, each class on its own, then the three pooled tests (exact McNemar over the five classes, with the whole-seed
# interval of the pooled difference at the level the tests are read at), each run once, and the twin of T2 at Ascension 0:
#   T1  A* against d0* (the synergy term)           -> experiments/ascension9/pooled-a9-t1-synergy-astar-vs-d0star.json
#   T2  the shown card values against rules_v1      -> experiments/ascension9/pooled-a9-t2-values-shown-vs-rules_v1.json
#   T3  the opening-relic rule against the baseline -> experiments/ascension9/pooled-a9-t3-neow-keep-v1-vs-rules_v2.json
#   T2 twin, Ascension 0, the relics kept (descriptive) -> experiments/ascension9/pooled-a0keep-t2-values-shown-vs-rules_v1.json
# It refuses to start unless all forty batches are finished and audited (a passing sample audit of at least 40 games for each, every win
# re-derived) and nothing of the study's results exists yet.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }

ids=""
for C in $CLASSES; do ids="$ids $(arm_ids "$C") $(twin_ids "$C")"; done
"$PY" - $ids <<'EOF' || fail "a batch is not finished and audited (see above)"
import json, sys
from pathlib import Path

problems = []
for bid in sys.argv[1:]:
    d = Path("experiments/batches") / bid
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
for f in pooled-a9-t1-synergy-astar-vs-d0star pooled-a9-t2-values-shown-vs-rules_v1 pooled-a9-t3-neow-keep-v1-vs-rules_v2 pooled-a0keep-t2-values-shown-vs-rules_v1; do
  [ ! -e "experiments/ascension9/$f.json" ] || fail "experiments/ascension9/$f.json exists: each test is run once"
done
if ls experiments/ascension9/per-class 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/ascension9/per-class holds output: the comparisons are run once"; fi
mkdir -p experiments/ascension9/per-class

pool_test() { # <test key> <file name> <arms or twin> <position of arm a in the class's id list> <position of arm b>
  local key=$1 name=$2 kind=$3 ia=$4 ib=$5 args="" C l ids a b
  for C in $CLASSES; do
    l=$(lower "$C")
    if [ "$kind" = arms ]; then read -r -a ids <<< "$(arm_ids "$C")"; else read -r -a ids <<< "$(twin_ids "$C")"; fi
    a="experiments/batches/${ids[$ia]}"; b="experiments/batches/${ids[$ib]}"
    "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/ascension9/per-class/$key-$l.json" || fail "compare failed for $C ($key)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --confidence "$LEVEL_CONFIDENCE" --out "experiments/ascension9/$name.json" || fail "pool failed ($key)"
  sha256sum "experiments/ascension9/$name.json" || fail "cannot hash $name.json"
}
pool_test a9-t2 pooled-a9-t2-values-shown-vs-rules_v1 arms 2 3
pool_test a9-t3 pooled-a9-t3-neow-keep-v1-vs-rules_v2 arms 4 5
pool_test a9-t1 pooled-a9-t1-synergy-astar-vs-d0star arms 0 1
pool_test a0keep-t2 pooled-a0keep-t2-values-shown-vs-rules_v1 twin 0 1
echo POOL_DONE
