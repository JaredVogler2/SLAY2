#!/usr/bin/env bash
# The checks that must hold before the first held-out game of this study (ADR-062 items 2 and 9); run-val.sh sources this file.
# Any failed check stops the run before a val3 seed is played, because each test is run once. (This is a process control, not a lock: a val3 game
# started by hand with `slay2_sim run` is not stopped by it. The record says that none was.)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries ADR-062 part 2"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
[ "$(git rev-parse --is-shallow-repository)" = false ] || fail "this is a shallow clone: the registration commit cannot be found reliably (git fetch --unshallow)"
git fetch -q --prune origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the registration before the first val3 game"
ADR=$(adr_section)
[ -n "$ADR" ] || fail "docs/DECISIONS.md does not carry ADR-062"

# the registration is complete: part 2 (the frozen choices; the text below is its heading, and nothing before it contains it) is in the record AT HEAD, and the code
# and data the arms read are those of the first commit that carries it. REG from the environment is refused unless ALLOW_REG_OVERRIDE=1.
MARKER='Frozen choices of ADR-062 (part 2)'
marks=$(grep -oF "$MARKER" <<< "$ADR" | wc -l)
[ "$marks" != 0 ] || fail "the ADR-062 record at HEAD does not carry part 2 (the text '$MARKER')"
[ "$marks" = 1 ] || fail "the ADR-062 record at HEAD must carry part 2 (the text '$MARKER') exactly once, it carries it $marks times"
if [ -n "${REG:-}" ] && [ "${ALLOW_REG_OVERRIDE:-}" != 1 ]; then fail "REG is set in the environment; refused (it would make the check that nothing changed since the registration empty). ALLOW_REG_OVERRIDE=1 allows it, for a test"; fi
REG=${REG:-$(git log -S"$MARKER" --format=%H -- docs/DECISIONS.md | tail -1)}
[ -n "$REG" ] || fail "cannot find the commit that carries ADR-062 part 2 (the text '$MARKER')"
git merge-base --is-ancestor "$REG" HEAD || fail "the registration commit $REG is not an ancestor of HEAD"
bad=$(pinned_problem "$REG" with-reading) || fail "code or data the arms read changed after the registration commit ${REG:0:12}: $bad"
git diff --quiet "$REG" HEAD -- experiments/thresh/dev-selection.json || fail "the development selection changed after the registration commit ${REG:0:12}"

# the arms that go forward are the arms that were screened: part 2 quotes the commit the development stage was played from (DEV_HEAD=<sha>), the code and data
# the arms execute are the same there and at the registration commit, and every development batch was played from it with the parameters common.sh gives each arm
DEV_HEAD=$(grep -oE 'DEV_HEAD=[0-9a-f]{40}' <<< "$ADR" | head -1 | cut -d= -f2)
[ -n "$DEV_HEAD" ] || fail "ADR-062 part 2 does not quote the commit the development stage was played from (DEV_HEAD=<40 hex>)"
git cat-file -e "$DEV_HEAD^{commit}" 2>/dev/null || fail "the development commit $DEV_HEAD is not in this repository"
git merge-base --is-ancestor "$DEV_HEAD" "$REG" || fail "the development commit is not an ancestor of the registration commit"
git diff --quiet "$DEV_HEAD" "$REG" -- "${SCREENED_PATHS[@]}" || fail "code or data the arms execute changed between the development commit ${DEV_HEAD:0:12} and the registration commit: $(git diff --name-only "$DEV_HEAD" "$REG" -- "${SCREENED_PATHS[@]}" | head -5 | tr '\n' ' ')"
# ... and so did what each arm is: the table of arms, as the development commit's common.sh defines it and as this one does
arm_table_at() { # <commit>
  local tmp rc; tmp=$(mktemp -d); mkdir -p "$tmp/scripts/studies/thresh"
  git show "$1:scripts/studies/thresh/common.sh" > "$tmp/scripts/studies/thresh/common.sh" 2>/dev/null || { rm -rf "$tmp"; return 1; }
  (OUT="$tmp/out"; source "$tmp/scripts/studies/thresh/common.sh" > /dev/null 2>&1 || exit 1; arm_table)
  rc=$?; rm -rf "$tmp"; return $rc
}
dev_table=$(arm_table_at "$DEV_HEAD") || fail "cannot read the arms as the development commit defines them"
reg_table=$(arm_table_at "$REG") || fail "cannot read the arms as the registration commit defines them"
[ -n "$dev_table" ] && [ "$dev_table" = "$reg_table" ] || fail "the arms are not defined alike at the development commit ${DEV_HEAD:0:12} and at the registration commit (their policies, parameters, batch ids, value files or seeds differ)"

# every file an arm reads is the file the registration names: its SHA-256 is quoted in ADR-062 itself (not elsewhere in the log), and it is committed
for f in $(shown_files) "$SEEDS" experiments/thresh/dev-selection.json; do
  [ -f "$f" ] || fail "$f is missing"
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed"
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sha" <<< "$ADR" || fail "ADR-062 does not quote the SHA-256 ($sha) of $f"
done
"$PY" -c "import json,sys; sys.exit(0 if json.load(open('experiments/thresh/dev-selection.json')).get('designChecksPassed') is True else 1)" || fail "the development selection does not say that the design checks passed"
# the arms the record says go to the held-out test are exactly the arms the screen chose (as whole words: ARM_<tag>); S and 0.2 are always played and need not be named
ARMS=$(val_arms) || fail "cannot read the development selection"
named=$(grep -oE '(^|[^A-Za-z0-9_])ARM_[a-z0-9]+' <<< "$ADR" | grep -oE 'ARM_[a-z0-9]+' | sort -u | sed 's/^ARM_//' | tr '\n' ' ')
want=$(for arm in $ARMS; do [ "$arm" = s ] || [ "$arm" = "$REPLICATION_TAG" ] || echo "$arm"; done | sort -u | tr '\n' ' ')
[ "$named" = "$want" ] || fail "ADR-062 part 2 names the arms '${named% }' (as ARM_<tag>); the development selection sent forward '${want% }'"
# the development batches the selection was read from exist and were played from DEV_HEAD with the parameters common.sh gives each arm
lines=""
for C in $CLASSES; do
  for arm in s $GRID_TAGS; do
    d="experiments/batches/$(dev_id "$arm" "$C")"
    [ -f "$d/manifest.json" ] || fail "the development batch $(dev_id "$arm" "$C") is missing"
    lines="$lines$d\t$(arm_policy "$arm")\t$(arm_params "$arm" "$C")\t$C\t$DEV_PARTITION\t$DEV_N\t0\n"
  done
done
printf "%b" "$lines" | STUDY_HEAD_EXPECTED=$DEV_HEAD "$PY" "$ROOT/scripts/studies/thresh/verify_batch.py" --many || fail "a development batch is not what ADR-062 says (see above)"

# each test is run once: no pooled result, per-class output, identity record or interval file of the held-out stage exists, and none is in the history
for p in pooled-thresh-T1 pooled-thresh-T2 pooled-thresh-T3 robustness-all-pairs verification; do
  [ ! -e "experiments/thresh/$p.json" ] || fail "the result experiments/thresh/$p.json exists: the test is run once"
  [ -z "$(git log --all --oneline -1 -- "experiments/thresh/$p.json")" ] || fail "experiments/thresh/$p.json is in the history: the test is run once"
done
for d in per-class identity; do
  if ls "experiments/thresh/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/thresh/$d holds output: the comparisons are run once"; fi
  [ -z "$(git log --all --oneline -1 -- "experiments/thresh/$d")" ] || fail "experiments/thresh/$d is in the history: the comparisons are run once"
done

# no game of the val3 seeds has been played, under any batch id (the seed of a batch's first episode is looked up: a run that died before its manifest was written is
# found too), unless an interrupted run is being finished (a finished batch is checked and never touched)
played=$("$PY" "$ROOT/scripts/studies/thresh/seeds_played.py" --batches experiments/batches --seeds "$SEEDS" --partitions "$VAL_PARTITION" | head -3 | tr '\n' ' ') || fail "cannot look for batches on the $VAL_PARTITION seeds"
if [ -n "$played" ] || ls experiments/batches 2>/dev/null | grep -Eq -- "^thresh-val-"; then
  [ "${RESUME:-}" = 1 ] || fail "batches on the $VAL_PARTITION seeds already exist (${played:-thresh-val-*}); if a run was interrupted, finish it with RESUME=1 (a finished batch is checked and never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD), registration ${REG:0:12}, development ${DEV_HEAD:0:12}, arms: $ARMS)"
