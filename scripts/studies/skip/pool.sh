#!/usr/bin/env bash
# The comparisons of ADR-065 for one leg: each class on its own (the arm that charges for a slot against the baseline), then the pooled check over the
# five classes (exact McNemar of the share past the Act-1 boss, with the whole-seed interval; the paired interval of the mean floors), each run once:
#   leg og -> experiments/skip/pooled-slot-og.json     leg ud -> experiments/skip/pooled-slot-ud.json
# It refuses to start unless the leg's five batches are finished and audited (a passing sample audit of at least 40 games for each, every win re-derived)
# and nothing of the leg's results exists yet.
#   pool.sh <leg: og | ud>
LEG=${1:-}
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
case "$LEG" in og | ud) ;; *) echo "usage: pool.sh <og|ud>" >&2; exit 2 ;; esac
[ -n "${RESULTS:-}" ] && [ -n "${BATCHES:-}" ] || fail "common.sh did not set RESULTS and BATCHES"

dirs=""
for C in $CLASSES; do dirs="$dirs $(s1_dir "$C" "$LEG")"; done
# shellcheck disable=SC2086
"$PY" - $dirs <<'EOF' || fail "a batch is not finished and audited (see above)"
import json, sys
from pathlib import Path

problems = []
for d in map(Path, sys.argv[1:]):
    try:
        m = json.loads((d / "manifest.json").read_text())
    except Exception as e:  # noqa: BLE001
        problems.append(f"{d.name}: no readable manifest ({e})")
        continue
    try:
        s = json.loads((d / "sample-audit.json").read_text())
        ok = (s["all_verified"] is True and s["verified"] == s["sample"]["drawn"] >= 40 and s["ledger"]["ok"] is True
              and s["batch_content_sha256"] == m["content_sha256"])
        if not ok:
            problems.append(f"{d.name}: the sample audit does not pass")
    except Exception as e:  # noqa: BLE001
        problems.append(f"{d.name}: no readable sample audit ({e})")
    wins = m["summary"]["counts"]["win"]
    if wins:
        try:
            w = json.loads((d / "wins-audit.json").read_text())
            if not (w["all_verified"] is True and w["wins_audited"] == w["wins_in_batch"] == wins):
                problems.append(f"{d.name}: not every win is re-derived")
        except Exception as e:  # noqa: BLE001
            problems.append(f"{d.name}: {wins} wins and no readable win audit ({e})")
for p in problems:
    print(p, file=sys.stderr)
sys.exit(1 if problems else 0)
EOF
[ ! -e "$RESULTS/pooled-slot-$LEG.json" ] || fail "$RESULTS/pooled-slot-$LEG.json exists: the check is run once"
if ls "$RESULTS/per-class" 2>/dev/null | grep -Eq "slot-$LEG-.*\.json$"; then fail "$RESULTS/per-class holds output of this leg: the comparisons are run once"; fi
mkdir -p "$RESULTS/per-class"

args=""
for C in $CLASSES; do
  l=$(lower "$C")
  a=$(s1_dir "$C" "$LEG"); b=$(s0_dir "$C" "$LEG")
  "$PY" -m slay2_sim compare "$a" "$b" --out "$RESULTS/per-class/slot-$LEG-$l.json" || fail "compare failed for $C"
  args="$args --pair $a $b"
done
# shellcheck disable=SC2086
"$PY" -m slay2_sim pool $args --iters 20000 --confidence "$LEVEL_CONFIDENCE" --out "$RESULTS/pooled-slot-$LEG.json" || fail "pool failed"
sha256sum "$RESULTS/pooled-slot-$LEG.json" || fail "cannot hash pooled-slot-$LEG.json"
echo POOL_DONE
