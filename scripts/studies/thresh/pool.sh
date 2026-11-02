#!/usr/bin/env bash
# The comparisons of ADR-062, each class on its own, then the pooled tests (exact McNemar over the two classes, the endpoint "the run was won", with the whole-seed
# interval at the level the tests are read at), each run once:
#   T1  the threshold 0.2 in Act 2 against S              -> experiments/thresh/pooled-thresh-T1.json     (the replication of ADR-061's A2)
#   T2  the screen's choice in Act 2 against S            -> experiments/thresh/pooled-thresh-T2.json     (only if the screen advanced a threshold)
#   T3  the screen's choice against the threshold 0.2     -> experiments/thresh/pooled-thresh-T3.json     (only if the screen advanced a threshold)
# It refuses to start unless the working tree is the registration's in everything the study pins (and the design text of the record is the registration's), the
# development selection is what the registered rule gives on the development batches, every held-out batch is finished and audited (a passing sample audit of at
# least 40 games for each, every win re-derived) and nothing of the study's held-out results exists yet. One run at a time. The design checks (ADR-062 item 5) come before
# any test is pooled. Everything is written to a scratch directory first and moved into experiments/thresh/ only when every step has ended well, so that a crash leaves
# nothing that the run-once guards would count as a first look.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "pool: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: pool from a clean checkout of the commit that ran the held-out stage"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: pool from a clean checkout"
exec 8> "$OUT/pooling.lock"
flock -n 8 || fail "another pooling holds $OUT/pooling.lock"
# the reading code and everything else the study pins is the commit's that carries part 2 (compared with the working tree, so that uncommitted edits count), and what
# the registration of part 1 froze is that, or part 2 quotes the change
REG=$(first_commit_with "$MARKER_TWO")
[ -n "$REG" ] || fail "cannot find the commit that carries part 2 of the registration of ADR-062"
REG1=$(first_commit_with "$MARKER_ONE")
[ -n "$REG1" ] || fail "cannot find the commit that carries the registration (part 1) of ADR-062"
bad=$(pinned_problem "$REG" with-reading) || fail "code or data the study pins is not that of the registration commit ${REG:0:12}: $bad"
bad=$(part_diff_problem "$REG1" "$REG" "$(adr_section)") || fail "$bad"
bad=$(design_problem "$REG1") || fail "$bad"
git diff --quiet "$REG" -- experiments/thresh/dev-selection.json || fail "the development selection is not the one the registration commit ${REG:0:12} carries"
"$PY" -m slay2_sim.threshstudy verify --batches experiments/batches --selection experiments/thresh/dev-selection.json || fail "the development selection is not what the registered rule gives on the development batches"
ARMS=$(val_arms) || fail "cannot read the development selection"
LEVEL_CONFIDENCE=$(val_level) || fail "cannot read the level from the development selection"
ids=""
for arm in $ARMS; do for C in $CLASSES; do ids="$ids $(val_id "$arm" "$C")"; done; done
# shellcheck disable=SC2086
"$PY" "$ROOT/scripts/studies/thresh/audits_ok.py" $ids || fail "a batch is not finished and audited (see above)"
for t in T1 T2 T3; do
  [ ! -e "experiments/thresh/pooled-thresh-$t.json" ] || fail "experiments/thresh/pooled-thresh-$t.json exists: each test is run once"
  [ -z "$(git log --all --oneline -1 -- "experiments/thresh/pooled-thresh-$t.json")" ] || fail "experiments/thresh/pooled-thresh-$t.json is in the history: each test is run once"
done
for f in robustness-all-pairs.json verification.json; do
  [ ! -e "experiments/thresh/$f" ] || fail "experiments/thresh/$f exists: it is written once"
done
for d in per-class identity; do
  if ls "experiments/thresh/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/thresh/$d holds output: the comparisons are run once"; fi
done

T=$(mktemp -d "$OUT/pool.XXXXXX")
mkdir -p "$T/identity" "$T/per-class"
# the design's own checks, on the held-out games, before any test is pooled (ADR-062 item 5): an arm is S's own record for every game S ended before Act 2 and cannot differ
# from S about the Act-1 boss; a failure stops the study and nothing is pooled
for arm in $ARMS; do
  [ "$arm" = s ] && continue
  "$PY" -m slay2_sim.threshstudy identity "$arm" --stage val --out "$T/identity/$arm.json" || fail "the design check of arm $arm failed: the study stops, nothing is pooled (ADR-062 item 5); the record of it is in $T"
done
pool_test() { # <test> <arm> <baseline>
  local t=$1 arm=$2 base=$3 args="" C l a b
  for C in $CLASSES; do
    l=$(lower "$C")
    a="experiments/batches/$(val_id "$arm" "$C")"; b="experiments/batches/$(val_id "$base" "$C")"
    "$PY" -m slay2_sim compare "$a" "$b" --out "$T/per-class/$t-$l.json" || fail "compare failed for $C ($t)"
    args="$args --pair $a $b"
  done
  # shellcheck disable=SC2086
  "$PY" -m slay2_sim pool $args --iters 20000 --endpoint win --confidence "$LEVEL_CONFIDENCE" --out "$T/pooled-thresh-$t.json" || fail "pool failed ($t)"
  sha256sum "$T/pooled-thresh-$t.json" || fail "cannot hash pooled-thresh-$t.json"
}
while read -r t arm base; do pool_test "$t" "$arm" "$base"; done < <(test_lines)
# the all-pairs analysis, a condition of the reading rule (ADR-062 item 4)
"$PY" scripts/studies/thresh/robustness.py --out "$T/robustness-all-pairs.json" || fail "the all-pairs analysis failed"
# the pooled files recomputed from the raw episodes by code that shares nothing with slay2_sim (ADR-062 item 10): the exact checks must all agree
"$PY" scripts/studies/thresh/verify_all.py "$T"/pooled-thresh-*.json --out "$T/verification.json" || fail "the independent recomputation of a pooled file disagrees with its episodes: the study stops (see above; nothing is written to experiments/thresh)"
mkdir -p experiments/thresh
entries=$(cd "$T" && ls -A)
if ! cp -a "$T"/. experiments/thresh/; then
  # a copy that fails half way leaves nothing that the run-once guards would count as a first look (none of these entries existed: the guards above checked)
  for e in $entries; do rm -rf "experiments/thresh/$e"; done
  fail "cannot move the results from $T into experiments/thresh (what was copied is removed; the results are still in $T)"
fi
rm -rf "$T"
echo POOL_DONE
