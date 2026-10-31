#!/usr/bin/env bash
# The checks that must hold before the first held-out game of this study (ADR-060 items 2 and 9); run-val.sh sources this file.
# Any failed check stops the run before a val seed is played, because each test is run once.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-val: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries ADR-060 part 2"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
git fetch -q origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the registration before the first val game"
ADR=$(adr_section)
[ -n "$ADR" ] || fail "docs/DECISIONS.md does not carry ADR-060"

# the registration is complete: part 2 (the frozen choices) is in the record, and the code and data the arms read are those of the commit that carries it
REG=${REG:-$(git log -S'Frozen for the held-out run' --format=%H -- docs/DECISIONS.md | tail -1)}
[ -n "$REG" ] || fail "cannot find the commit that carries ADR-060 part 2 (the text 'Frozen for the held-out run')"
git merge-base --is-ancestor "$REG" HEAD || fail "the registration commit $REG is not an ancestor of HEAD"
# shellcheck disable=SC2086
git diff --quiet "$REG" HEAD -- $PINNED_PATHS experiments/act2/dev-selection.json || fail "code or data the arms read changed after the registration commit ${REG:0:12}: $(git diff --name-only "$REG" HEAD -- $PINNED_PATHS experiments/act2/dev-selection.json | head -5 | tr '\n' ' ')"

# every file an arm reads is the file the registration names: its SHA-256 is quoted in ADR-060 itself (not elsewhere in the log), and it is committed
for f in $(shown_files) $(act2_files) experiments/act2/dev-selection.json; do
  [ -f "$f" ] || fail "$f is missing"
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed"
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sha" <<< "$ADR" || fail "ADR-060 does not quote the SHA-256 ($sha) of $f"
done
# the arms the record says go to the held-out test are the arms the screen chose
ARMS=$(val_arms) || fail "cannot read the development selection"
for arm in $ARMS; do
  [ "$arm" = s ] || [ "$arm" = lead ] || grep -q "ARM_$arm" <<< "$ADR" || fail "ADR-060 part 2 does not name the arm $arm (as ARM_$arm)"
done
# the development batches the selection was read from exist and are the ones its pooled files name (the screen is not re-run)
for C in $CLASSES; do
  for arm in s lead $P_TAGS; do
    [ -f "experiments/batches/$(dev_id "$arm" "$C")/manifest.json" ] || fail "the development batch $(dev_id "$arm" "$C") is missing"
  done
done

# each test is run once: no pooled result, per-class output, determinism record or interval file of the study exists, and none is in the history
for p in pooled-act2-L pooled-act2-P pooled-act2-V; do
  [ ! -e "experiments/act2/$p.json" ] || fail "the pooled result experiments/act2/$p.json exists: the test is run once"
  [ -z "$(git log --all --oneline -1 -- "experiments/act2/$p.json")" ] || fail "experiments/act2/$p.json is in the history: the test is run once"
done
for d in per-class determinism; do
  if ls "experiments/act2/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/act2/$d holds output: the comparisons are run once"; fi
  [ -z "$(git log --all --oneline -1 -- "experiments/act2/$d")" ] || fail "experiments/act2/$d is in the history: the comparisons are run once"
done

# no val batch of the study exists unless an interrupted run is being finished (a finished batch is checked and never touched)
if ls experiments/batches 2>/dev/null | grep -Eq -- '^act2-.*-val-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches of the val arms already exist; if a run was interrupted, finish it with RESUME=1 (a finished batch is checked and never touched)"
fi
echo "preflight-val: ok (commit $(git rev-parse --short=12 HEAD), registration ${REG:0:12}, arms: $ARMS)"
