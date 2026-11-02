#!/usr/bin/env bash
# The checks that must hold before the first held-out game of one leg of this study (ADR-065 item 2); run-val.sh sources this file (LEG is set).
# Any failed check stops the run before a val seed is played, because each check is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries ADR-065"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the registration before the first val game"
ADR=$(adr_section)
[ -n "$ADR" ] || fail "docs/DECISIONS.md does not carry ADR-065"

# the code and data the arms read, and the page's own index, are those of the registration commit (the first commit that carries the ADR-065 text)
REG=${REG:-$(git log -S'ADR-065: the advisor charges for a slot' --format=%H -- docs/DECISIONS.md | tail -1)}
[ -n "$REG" ] || fail "cannot find the commit that registered ADR-065"
git merge-base --is-ancestor "$REG" HEAD || fail "the registration commit $REG is not an ancestor of HEAD"
# shellcheck disable=SC2086
git diff --quiet "$REG" HEAD -- $PINNED_PATHS || fail "code or data the arms read changed after the registration commit ${REG:0:12}: $(git diff --name-only "$REG" HEAD -- $PINNED_PATHS | head -5 | tr '\n' ' ')"

# the price the arm charges is the price the page charges: the constants of the page's index and of its Python port, and the arm's parameters
"$PY" - <<'EOF' || fail "the page's price of a slot is not the 1.0 from the 20th card that ADR-065 registers, or the arm does not charge it"
import re, sys
from pathlib import Path
from slay2_sim import advisor
ts = Path("packages/decision/src/quality.ts").read_text(encoding="utf-8")
size_from = int(re.search(r"export const SIZE_FROM = (\d+);", ts).group(1))
size_price = float(re.search(r"export const SIZE_PRICE = ([\d.]+);", ts).group(1))
sys.exit(0 if (size_from, size_price) == (20, 1.0) and (advisor.SIZE_FROM, advisor.SIZE_PRICE) == (20, 1.0) else 1)
EOF
"$PY" -c "import json,sys; p=json.loads(sys.argv[1]); sys.exit(0 if (p.get('size'), p.get('size_from')) == (1.0, 20) else 1)" "$S1_PARAMS" || fail "S1_PARAMS does not name the page's price"

# the golden file the Python port is tested against is the one the TypeScript writes today (the web side runs it; here: the port reproduces it)
"$PY" -m pytest sim/tests/test_advisor_port.py sim/tests/test_advisor_v1.py -q -x --no-header -p no:cacheprovider > "$OUT/preflight-port.log" 2>&1 \
  || fail "the Python port of the index does not reproduce the golden cases, or the pilot's tests fail (see $OUT/preflight-port.log)"

# the precondition (development seeds) was run, committed and passed
[ -f "$RESULTS/precondition.json" ] || fail "$RESULTS/precondition.json is missing"
git ls-files --error-unmatch "$RESULTS/precondition.json" > /dev/null 2>&1 || fail "the precondition report is not committed"
"$PY" -c "import json,sys; sys.exit(0 if json.load(open('$RESULTS/precondition.json'))['passed'] is True else 1)" || fail "the precondition did not pass"

# the baselines of the leg exist, are finished and audited, and are replayed by the code of this commit (a baseline that this code does not reproduce
# would make the pairs compare two different games): the sample audit of each is run into a temporary copy, so that no committed file is touched
for C in $CLASSES; do
  b=$(s0_dir "$C" "$LEG")
  verify_batch "$b" val 2000 "$LEG" s0 || fail "the baseline $b is not the batch ADR-065 names"
  "$PY" - "$b" <<'EOF' || fail "the baseline $b has no passing sample audit"
import json, sys
s = json.load(open(sys.argv[1] + "/sample-audit.json"))
sys.exit(0 if (s["all_verified"] is True and s["verified"] == s["sample"]["drawn"] >= 40) else 1)
EOF
  tmp=$(mktemp -d "$OUT/replay.XXXXXX")
  cp -r "$b/." "$tmp/"
  "$PY" -m slay2_sim audit sample --batch "$tmp" --limit 40 > "$tmp/audit.log" 2>&1 || fail "this commit does not replay 40 games of the baseline $b (see $tmp/audit.log)"
  rm -rf "$tmp"
done

# each check is run once: no pooled result, per-class output or interval file of the leg exists, and none is in the history
for p in pooled-slot-$LEG; do
  [ ! -e "$RESULTS/$p.json" ] || fail "the pooled result $RESULTS/$p.json exists: the check is run once"
  [ -z "$(git log --all --oneline -1 -- "$RESULTS/$p.json")" ] || fail "$RESULTS/$p.json is in the history: the check is run once"
done
if ls "$RESULTS/per-class" 2>/dev/null | grep -Eq "slot-$LEG-.*\\.json$"; then fail "$RESULTS/per-class holds output of this leg: the comparisons are run once"; fi

# no val batch of the leg exists unless an interrupted run is being finished (a finished batch is checked and never touched)
if ls "$BATCHES" 2>/dev/null | grep -Eq -- "$(if [ "$LEG" = ud ]; then echo '-underdocks-val-'; else echo '-keeprelics-val-n2000$'; fi)"; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arm already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is checked and never touched)"
fi
echo "preflight-val: ok (leg $LEG, commit $(git rev-parse --short=12 HEAD), registration ${REG:0:12})"
