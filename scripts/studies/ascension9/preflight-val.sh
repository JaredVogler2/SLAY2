#!/usr/bin/env bash
# The checks that must hold before the first held-out game of this study (ADR-058 item 2); run-val.sh sources this file.
# Any failed check stops the run before a val seed is played, because each test is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries ADR-058"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the registration before the first val game"
ADR=$(adr_section)
[ -n "$ADR" ] || fail "docs/DECISIONS.md does not carry ADR-058"

# the code and data the arms read are those of the registration commit (the first commit that carries the ADR-058 text; REG=<sha> names
# another one when an addendum of the record has moved it on purpose)
REG=${REG:-$(git log -S'ADR-058: do the three results' --format=%H -- docs/DECISIONS.md | tail -1)}
[ -n "$REG" ] || fail "cannot find the commit that registered ADR-058"
git merge-base --is-ancestor "$REG" HEAD || fail "the registration commit $REG is not an ancestor of HEAD"
# shellcheck disable=SC2086
git diff --quiet "$REG" HEAD -- $PINNED_PATHS || fail "code or data the arms read changed after the registration commit ${REG:0:12}: $(git diff --name-only "$REG" HEAD -- $PINNED_PATHS | head -5 | tr '\n' ' ')"

# every file an arm reads is the file the registration names: its SHA-256 is quoted in ADR-058 itself (not elsewhere in the log), and it is committed
for f in $VALUE_FILES "$NEOW_VALUES"; do
  [ -f "$f" ] || fail "$f is missing"
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed"
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sha" <<< "$ADR" || fail "ADR-058 does not quote the SHA-256 ($sha) of $f"
done

# the card table of T1 is the one ADR-050 addendum B froze: its content hash (the recipe of packages/game-data/test/synergy.test.ts, canonical
# JSON of the mechanics, the cards and the innate supplies) is recomputed here, equals the one stored in the file and the one ADR-058 quotes
[ -f "$SYNERGY_TABLE" ] || fail "$SYNERGY_TABLE is missing"
git ls-files --error-unmatch "$SYNERGY_TABLE" > /dev/null 2>&1 || fail "$SYNERGY_TABLE is not committed"
tsha=$("$PY" - "$SYNERGY_TABLE" <<'EOF'
import hashlib, json, sys
d = json.load(open(sys.argv[1]))
body = {"mechanics": d["mechanics"], "cards": d["cards"], "innate": d["innate"]}
text = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
stored = d["sha256"]
got = hashlib.sha256(text.encode("utf-8")).hexdigest()
print(got if got == stored else "stored-hash-does-not-match-the-content")
EOF
) || fail "cannot read the card table"
[ "$tsha" = "$SYNERGY_TABLE_SHA" ] || fail "the card table's content hash is $tsha, not the $SYNERGY_TABLE_SHA that ADR-050 and ADR-054 name"
grep -q "$SYNERGY_TABLE_SHA" <<< "$ADR" || fail "ADR-058 does not quote the card table's hash"

# the Ironclad baseline follows the pilot's default card values, as in ADR-049 and ADR-055: that default must still be the file ADR-058 names
dv=$("$PY" -c "from slay2_sim.policies.rules2 import DEFAULT_VALUES; print(DEFAULT_VALUES)") || fail "cannot read the pilot's default card values"
[ "$dv" = experiments/cardvalue/ironclad-a0-v1.json ] || fail "the pilot's default card values are $dv, not the file the Ironclad baseline of ADR-055 follows"
# the value files of T2 are the ones the site shows at this commit (the registration says: the site's sets of ADR-046 and ADR-053)
"$PY" - "$ROOT" <<'EOF' || fail "experiments/cardvalue/site-sets.json does not list the value files ADR-058 names"
import json, sys
sets = json.load(open(sys.argv[1] + "/experiments/cardvalue/site-sets.json"))["sets"]
got = sorted("experiments/cardvalue/" + s["file"] for s in sets)
want = sorted(["experiments/cardvalue/ironclad-a0-v2.json"] + [f"experiments/cardvalue/{c}-a0-keep-v1.json" for c in ("silent", "regent", "necrobinder", "defect")])
sys.exit(0 if got == want else 1)
EOF

# the precondition (development seeds) was run, committed and passed
[ -f experiments/ascension9/precondition.json ] || fail "experiments/ascension9/precondition.json is missing"
git ls-files --error-unmatch experiments/ascension9/precondition.json > /dev/null 2>&1 || fail "the precondition report is not committed"
"$PY" -c "import json,sys; sys.exit(0 if json.load(open('experiments/ascension9/precondition.json'))['passed'] is True else 1)" || fail "the precondition did not pass"

# each test is run once: no pooled result, per-class output or interval file of the study exists, and none is in the history
for p in pooled-a9-t1-synergy-astar-vs-d0star pooled-a9-t2-values-shown-vs-rules_v1 pooled-a9-t3-neow-keep-v1-vs-rules_v2 pooled-a0keep-t2-values-shown-vs-rules_v1; do
  [ ! -e "experiments/ascension9/$p.json" ] || fail "the pooled result experiments/ascension9/$p.json exists: the test is run once"
  [ -z "$(git log --all --oneline -1 -- "experiments/ascension9/$p.json")" ] || fail "experiments/ascension9/$p.json is in the history: the test is run once"
done
if ls experiments/ascension9/per-class 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/ascension9/per-class holds output: the comparisons are run once"; fi
[ -z "$(git log --all --oneline -1 -- experiments/ascension9/per-class)" ] || fail "experiments/ascension9/per-class is in the history: the comparisons are run once"

# no val batch of the study exists unless an interrupted run is being finished (a finished batch is checked and never touched)
if ls experiments/batches 2>/dev/null | grep -Eq -- '-a9-veteran-keeprelics-val-|^(rules_v2-shownvals|rules_v1)-.*-a0-veteran-keeprelics-val-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arms already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is checked and never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD), registration ${REG:0:12})"
