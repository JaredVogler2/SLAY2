#!/usr/bin/env bash
# The comparisons of ADR-061, each class on its own, then the pooled tests (exact McNemar over the five classes, the endpoint "the run was won", with the
# whole-seed interval at the level the tests are read at), each run once:
#   L   the lead (card-pick threshold 0.2 in every act) against S                -> experiments/acts/pooled-acts-L.json
#   A1  0.2 in the card rewards of Act 1 only (S's 0 in the others) against S    -> experiments/acts/pooled-acts-A1.json
#   A2  0.2 in the card rewards of Act 2 only against S                          -> experiments/acts/pooled-acts-A2.json
#   A3  0.2 in the card rewards of Act 3 only against S                          -> experiments/acts/pooled-acts-A3.json
# It refuses to start unless the working tree is the registration's in everything the study pins, every batch is finished and audited (a passing sample audit of
# at least 40 games for each, every win re-derived) and nothing of the study's results exists yet. The design checks (ADR-061 item 5) come before any test is
# pooled. Everything is written to a scratch directory first and moved into experiments/acts/ only when every step has ended well, so that a crash leaves
# nothing that the run-once guards would count as a first look.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: pool from a clean checkout of the commit that ran the study"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: pool from a clean checkout"
# the reading code and everything else the study pins is the registration commit's (compared with the working tree, so that uncommitted edits count)
MARKER='Registration of ADR-061 (frozen choices)'
REG=$(git log -S"$MARKER" --format=%H -- docs/DECISIONS.md | tail -1)
[ -n "$REG" ] || fail "cannot find the commit that carries the registration of ADR-061"
bad=$(pinned_problem "$REG") || fail "code or data the study pins is not that of the registration commit ${REG:0:12}: $bad"
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
  [ -z "$(git log --all --oneline -1 -- "experiments/acts/pooled-acts-$t.json")" ] || fail "experiments/acts/pooled-acts-$t.json is in the history: each test is run once"
done
for f in robustness-all-pairs.json verification.json; do
  [ ! -e "experiments/acts/$f" ] || fail "experiments/acts/$f exists: it is written once"
done
for d in per-class identity; do
  if ls "experiments/acts/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/acts/$d holds output: the comparisons are run once"; fi
done

T=$(mktemp -d "$OUT/pool.XXXXXX")
mkdir -p "$T/identity" "$T/per-class"
# the design's own checks, on the held-out games, before any test is pooled (ADR-061 item 5): an arm that is S in the early acts is S's record for every game S
# ended before the act that differs and cannot differ from S about the bosses before it; a failure stops the study and nothing is pooled
for t in A2 A3; do
  "$PY" -m slay2_sim.actsstudy identity "$t" --out "$T/identity/$t.json" || fail "the design check of test $t failed: the study stops, nothing is pooled (ADR-061 item 5); the record of it is in $T"
done
pool_test() { # <test> <arm>
  local t=$1 arm=$2 args="" C l a b
  for C in $CLASSES; do
    l=$(lower "$C")
    a="experiments/batches/$(val_id "$arm" "$C")"; b="experiments/batches/$(val_id s "$C")"
    "$PY" -m slay2_sim compare "$a" "$b" --out "$T/per-class/$t-$l.json" || fail "compare failed for $C ($t)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --endpoint win --confidence "$LEVEL_CONFIDENCE" --out "$T/pooled-acts-$t.json" || fail "pool failed ($t)"
  sha256sum "$T/pooled-acts-$t.json" || fail "cannot hash pooled-acts-$t.json"
}
for arm in $ARMS_ALL; do
  [ "$arm" = s ] || pool_test "$(test_name "$arm")" "$arm"
done
# the all-pairs analysis, a condition of the reading rule (ADR-061 item 4)
"$PY" scripts/studies/acts/robustness.py --out "$T/robustness-all-pairs.json" || fail "the all-pairs analysis failed"
# the pooled files recomputed from the raw episodes by code that shares nothing with slay2_sim (ADR-061 item 10): the exact checks must all agree
"$PY" scripts/studies/acts/verify_all.py "$T"/pooled-acts-*.json --out "$T/verification.json" || fail "the independent recomputation of a pooled file disagrees with its episodes: the study stops (see above; nothing is written to experiments/acts)"
mkdir -p experiments/acts
cp -a "$T"/. experiments/acts/ || fail "cannot move the results from $T into experiments/acts"
rm -rf "$T"
echo POOL_DONE
