#!/usr/bin/env bash
# The comparisons of ADR-061, each class on its own, then the pooled tests (exact McNemar over the five classes, the endpoint "the run was won", with the
# whole-seed interval at the level the tests are read at), each run once:
#   L   the lead (card-pick threshold 0.2 in every act) against S                -> experiments/acts/pooled-acts-L.json
#   A1  0.2 in the card rewards of Act 1 only (S's 0 in the others) against S    -> experiments/acts/pooled-acts-A1.json
#   A2  0.2 in the card rewards of Act 2 only against S                          -> experiments/acts/pooled-acts-A2.json
#   A3  0.2 in the card rewards of Act 3 only against S                          -> experiments/acts/pooled-acts-A3.json
# It refuses to start unless every batch is finished and audited (a passing sample audit of at least 40 games for each, every win re-derived) and
# nothing of the study's results exists yet.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
ids=""
for arm in $ARMS_ALL; do for C in $CLASSES; do ids="$ids $(val_id "$arm" "$C")"; done; done
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
    problems.append(f"the batches were played from {len(heads)} different commits ({sorted(str(h)[:12] for h in heads)}); ADR-061 item 9 has one")
for p in problems:
    print(p, file=sys.stderr)
sys.exit(1 if problems else 0)
PYEOF
for t in $TESTS; do
  [ ! -e "experiments/acts/pooled-acts-$t.json" ] || fail "experiments/acts/pooled-acts-$t.json exists: each test is run once"
done
[ ! -e experiments/acts/robustness-all-pairs.json ] || fail "experiments/acts/robustness-all-pairs.json exists: it is written once"
# the reading code (the exporter's reader, the shared reader of pooled files, the independent verifier) is that of the registration commit
MARKER='Registration of ADR-061 (frozen choices)'
REG=$(git log -S"$MARKER" --format=%H -- docs/DECISIONS.md | tail -1)
[ -n "$REG" ] || fail "cannot find the commit that carries the registration of ADR-061"
# shellcheck disable=SC2086
git diff --quiet "$REG" HEAD -- $READING_PATHS || fail "the reading code changed after the registration commit ${REG:0:12}: $(git diff --name-only "$REG" HEAD -- $READING_PATHS | tr '\n' ' ')"
# the design's own check, on the held-out games: an arm that is S in the early acts is S's record for every game S ended before the act that differs,
# and cannot differ from S about the bosses before it; a failure stops the study (ADR-061 item 6)
mkdir -p experiments/acts/identity
for t in A2 A3; do
  "$PY" -m slay2_sim.actsstudy identity "$t" --out "experiments/acts/identity/$t.json" || fail "the identity check of test $t failed: the study stops (ADR-061 item 6)"
done
for d in per-class; do
  if ls "experiments/acts/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/acts/$d holds output: the comparisons are run once"; fi
  mkdir -p "experiments/acts/$d"
done

pool_test() { # <test> <arm>
  local t=$1 arm=$2 args="" C l a b
  for C in $CLASSES; do
    l=$(lower "$C")
    a="experiments/batches/$(val_id "$arm" "$C")"; b="experiments/batches/$(val_id s "$C")"
    "$PY" -m slay2_sim compare "$a" "$b" --out "experiments/acts/per-class/$t-$l.json" || fail "compare failed for $C ($t)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --endpoint win --confidence "$LEVEL_CONFIDENCE" --out "experiments/acts/pooled-acts-$t.json" || fail "pool failed ($t)"
  sha256sum "experiments/acts/pooled-acts-$t.json" || fail "cannot hash pooled-acts-$t.json"
}
for arm in $ARMS_ALL; do
  [ "$arm" = s ] || pool_test "$(test_name "$arm")" "$arm"
done
# a design check on the pooled tables too: an arm that is S until act k cannot differ from S about the bosses before it
"$PY" - <<'PYEOF' || fail "an arm differs from S about a boss before the act it is pickier in (ADR-061 item 6): the study stops"
import json, sys
from slay2_sim.actsstudy import TESTS, boss_agreement_problem
bad = [p for t in TESTS if (p := boss_agreement_problem(t, json.load(open(f"experiments/acts/pooled-acts-{t}.json"))))]
for p in bad:
    print(p, file=sys.stderr)
sys.exit(1 if bad else 0)
PYEOF
# the all-pairs analysis, a condition of the reading rule (ADR-061 item 4)
"$PY" scripts/studies/acts/robustness.py --out experiments/acts/robustness-all-pairs.json || fail "the all-pairs analysis failed"
echo POOL_DONE
