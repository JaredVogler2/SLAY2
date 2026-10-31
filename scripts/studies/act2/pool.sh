#!/usr/bin/env bash
# The comparisons of ADR-060, each class on its own, then the pooled tests (exact McNemar over the five classes, the endpoint "got past the Act-2
# boss", with the whole-seed interval at the level the tests are read at), each run once, and the determinism record of the replayed baseline:
#   L  the lead (card-pick threshold 0.2 in every act) against S   -> experiments/act2/pooled-act2-L.json
#   P  the Act-2 late threshold the screen chose, against S        -> experiments/act2/pooled-act2-P.json   (if it went forward)
#   V  the Act-2 values in Act 2, against S                        -> experiments/act2/pooled-act2-V.json   (if it went forward)
# It refuses to start unless every batch is finished and audited (a passing sample audit of at least 40 games for each, every win re-derived) and
# nothing of the study's results exists yet.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
ARMS=$(val_arms) || fail "cannot read the development selection"
ids=""
for arm in $ARMS; do for C in $CLASSES; do ids="$ids $(val_id "$arm" "$C")"; done; done
"$PY" - $ids <<'PYEOF' || fail "a batch is not finished and audited (see above)"
import json, sys
from pathlib import Path

problems = []
heads = set()
for bid in sys.argv[1:]:
    d = Path("experiments/batches") / bid
    try:
        m = json.loads((d / "manifest.json").read_text())
    except Exception as e:  # noqa: BLE001
        problems.append(f"{bid}: no readable manifest ({e})")
        continue
    heads.add(((m.get("environment") or {}).get("slay2") or {}).get("head"))
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
if len(heads) != 1:
    problems.append(f"the batches were played from {len(heads)} different commits ({sorted(str(h)[:12] for h in heads)}); ADR-060 item 9 has one")
for p in problems:
    print(p, file=sys.stderr)
sys.exit(1 if problems else 0)
PYEOF
for t in L P V; do
  [ ! -e "experiments/act2/pooled-act2-$t.json" ] || fail "experiments/act2/pooled-act2-$t.json exists: each test is run once"
done
[ ! -e experiments/act2/robustness-errors.json ] || fail "experiments/act2/robustness-errors.json exists: it is written once"
# the reading code (the exporter's reader, the shared reader of pooled files, the independent verifier) is that of the registration commit
MARKER='Frozen choices of ADR-060 (part 2)'
REG=$(git log -S"$MARKER" --format=%H -- docs/DECISIONS.md | tail -1)
[ -n "$REG" ] || fail "cannot find the commit that carries ADR-060 part 2"
# shellcheck disable=SC2086
git diff --quiet "$REG" HEAD -- $READING_PATHS || fail "the reading code changed after the registration commit ${REG:0:12}: $(git diff --name-only "$REG" HEAD -- $READING_PATHS | tr '\n' ' ')"
# the design's own check, on the held-out games: an arm that differs from S in Act 2 only is S's record for every game S ended in Act 1, and a class that
# kept its shown values is S's record in every game (ADR-060 addendum B); a failure stops the study
mkdir -p experiments/act2/identity
for arm in $ARMS; do
  t=$(test_name "$arm" 2>/dev/null) || continue      # the baseline has no test
  [ "$t" = L ] && continue                           # the lead differs from S from Act 1 on: nothing to check
  "$PY" -m slay2_sim.act2study identity "$t" --out "experiments/act2/identity/$t.json" || fail "the identity check of test $t failed: the study stops (ADR-060 item 6 and addendum B)"
done
for d in per-class determinism; do
  if ls "experiments/act2/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/act2/$d holds output: the comparisons are run once"; fi
  mkdir -p "experiments/act2/$d"
done

# the baseline replayed under this commit against the batches that were played at 687db50 (a determinism record: how many games are the same games)
for C in $CLASSES; do
  l=$(lower "$C")
  "$PY" -m slay2_sim.act2study determinism "experiments/batches/$(val_id s "$C")" "experiments/batches/rules_v2-shownvals-$l-a0-veteran-keeprelics-val-n2000" \
    --out "experiments/act2/determinism/$l.json" >> "$OUT/determinism.log" 2>&1 || fail "the determinism record of $C failed (see $OUT/determinism.log)"   # that some games differ is data, not an error
done

pool_test() { # <test> <arm>
  local t=$1 arm=$2 args="" C l
  for C in $CLASSES; do
    l=$(lower "$C")
    a="experiments/batches/$(val_id "$arm" "$C")"; b="experiments/batches/$(val_id s "$C")"
    "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/act2/per-class/$t-$l.json" || fail "compare failed for $C ($t)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --endpoint act2 --confidence "$LEVEL_CONFIDENCE" --out "experiments/act2/pooled-act2-$t.json" || fail "pool failed ($t)"
  sha256sum "experiments/act2/pooled-act2-$t.json" || fail "cannot hash pooled-act2-$t.json"
}
for arm in $ARMS; do
  [ "$arm" = s ] || pool_test "$(test_name "$arm")" "$arm"
done
# the observed-endpoint analysis, a condition of the reading rule (ADR-060 addendum B)
"$PY" scripts/studies/act2/robustness.py --out experiments/act2/robustness-errors.json || fail "the observed-endpoint analysis failed"
echo POOL_DONE
