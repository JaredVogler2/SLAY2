#!/usr/bin/env bash
# The checks that must hold before the first development game of this study (ADR-062 items 2 and 9); dev.sh sources this file.
# Any failed check stops the stage before a dev2 seed is played, because the screen is read once. (This is a process control, not a lock: a dev2 or val3 game
# started by hand with `slay2_sim run` is not stopped by it. The record says that none was.)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fail() { echo "preflight-dev: $*" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "tracked files are modified: start from a clean checkout of the commit that carries the registration of ADR-062"
[ -z "$(git ls-files --others --exclude-standard | grep -vE '^(experiments|artifacts)/')" ] || fail "untracked files outside experiments/ and artifacts/: start from a clean checkout"
[ "$(git rev-parse --is-shallow-repository)" = false ] || fail "this is a shallow clone: the registration commit cannot be found reliably (git fetch --unshallow)"
git fetch -q --prune origin 2>/dev/null || fail "cannot reach the remote to check that this commit is pushed"
[ -n "$(git branch -r --contains HEAD 2>/dev/null)" ] || fail "HEAD is not on the remote: push the registration before the first dev2 game"
ADR=$(adr_section)
[ -n "$ADR" ] || fail "docs/DECISIONS.md does not carry ADR-062"

# the registration is complete: part 1 (the text below is a heading of the record, and nothing before the registration contains it) is in the record AT HEAD, and
# the code and data the arms read are those of the first commit that carries it. REG from the environment is refused unless ALLOW_REG_OVERRIDE=1.
MARKER='Registration of ADR-062 (part 1, frozen choices)'
# (the marker occurs once: a second mention would make the first commit that has the text not the registration)
marks=$(grep -oF "$MARKER" <<< "$ADR" | wc -l)
[ "$marks" != 0 ] || fail "the ADR-062 record at HEAD does not carry its registration (the text '$MARKER')"
[ "$marks" = 1 ] || fail "the ADR-062 record at HEAD must carry its registration (the text '$MARKER') exactly once, it carries it $marks times"
if [ -n "${REG:-}" ]; then
  [ "${ALLOW_REG_OVERRIDE:-}" = 1 ] || fail "REG is set in the environment; refused (it would make the check that nothing changed since the registration empty). ALLOW_REG_OVERRIDE=1 allows it, for a test"
  echo "preflight-dev: NOTICE: the registration commit was named from the environment (ALLOW_REG_OVERRIDE=1), not found from the record: ${REG:0:12}" >&2
fi
REG=${REG:-$(git log -S"$MARKER" --format=%H -- docs/DECISIONS.md | tail -1)}
[ -n "$REG" ] || fail "cannot find the commit that carries the registration of ADR-062 (the text '$MARKER')"
git merge-base --is-ancestor "$REG" HEAD || fail "the registration commit $REG is not an ancestor of HEAD"
bad=$(pinned_problem "$REG") || fail "code or data the arms read changed after the registration commit ${REG:0:12}: $bad"

# every file an arm reads is the file the registration names: its SHA-256 is quoted in ADR-062 itself (not elsewhere in the log), and it is committed.
# The seed file is one of them: it holds the dev2 and val3 seeds (and the partitions the earlier studies were played on, which are the same as in the earlier files).
for f in $(shown_files) "$SEEDS"; do
  [ -f "$f" ] || fail "$f is missing"
  git ls-files --error-unmatch "$f" > /dev/null 2>&1 || fail "$f is not committed"
  sha=$(sha256sum "$f" | cut -d' ' -f1)
  grep -q "$sha" <<< "$ADR" || fail "ADR-062 does not quote the SHA-256 ($sha) of $f"
done
"$PY" - <<PYEOF || fail "the seed file is not a valid v4 manifest with $DEV_N dev2 seeds and $VAL_N val3 seeds disjoint from every other partition"
import sys
from slay2_sim.manifest import load_seed_manifest
m = load_seed_manifest("$SEEDS")                      # checksum and disjointness
p = m["partitions"]
sys.exit(0 if len(p.get("dev2", [])) == $DEV_N and "dev2" == "$DEV_PARTITION" and len(p.get("val3", [])) == $VAL_N and "val3" == "$VAL_PARTITION" and len(p.get("test", [])) > 0 else 1)
PYEOF

# the screen is read once: no selection, per-class output or identity record of the study exists, and none is in the history
for p in dev-selection pooled-thresh-T1 pooled-thresh-T2 pooled-thresh-T3 robustness-all-pairs verification; do
  [ ! -e "experiments/thresh/$p.json" ] || fail "the result experiments/thresh/$p.json exists: it is written once"
  [ -z "$(git log --all --oneline -1 -- "experiments/thresh/$p.json")" ] || fail "experiments/thresh/$p.json is in the history: it is written once"
done
for d in per-class identity; do
  if ls "experiments/thresh/$d" 2>/dev/null | grep -Eq '\.json$'; then fail "experiments/thresh/$d holds output: the comparisons are run once"; fi
  [ -z "$(git log --all --oneline -1 -- "experiments/thresh/$d")" ] || fail "experiments/thresh/$d is in the history: the comparisons are run once"
done

# no game of the dev2 or val3 seeds has been played, under any batch id (the seed of a batch's first episode is looked up: a run that died before its manifest was
# written is found too), unless an interrupted stage is being finished (a finished batch is checked and never touched)
played=$("$PY" "$ROOT/scripts/studies/thresh/seeds_played.py" --batches experiments/batches --seeds "$SEEDS" --partitions "$DEV_PARTITION" "$VAL_PARTITION" | head -3 | tr '\n' ' ') || fail "cannot look for batches on the fresh seeds"
if [ -n "$played" ] || ls experiments/batches 2>/dev/null | grep -Eq -- '^thresh-'; then
  [ "${RESUME:-}" = 1 ] || fail "batches on the $DEV_PARTITION or $VAL_PARTITION seeds already exist (${played:-thresh-*}); if a stage was interrupted, finish it with RESUME=1 (a finished batch is checked and never touched)"
fi
echo "preflight-dev: ok (commit $(git rev-parse --short=12 HEAD), registration ${REG:0:12}, arms: s $GRID_TAGS)"
